import {
  GetMetricDataCommand,
  GetMetricStatisticsCommand,
  ListMetricsCommand,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimCloudWatchInvalidParameterValueException } from "../../cloudwatch/error/sim-cloudwatch.error.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../sim-lambda.js";
import type { SimLambdaHandler } from "../function/sim-lambda-handler.type.js";

const functionName = "orders";
const startedAt = new Date("2026-08-30T09:00:00.000Z");

/** A simulation with a stopped clock and one function bound to a handler. */
async function simAwsWithFunction(
  handler: SimLambdaHandler = () => "done",
): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.clock().setTo(startedAt);
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );
  await simAws.backgroundTasksComplete();

  return simAws;
}

/** The `Sum` of one AWS/Lambda metric for the function over the window. */
async function counted(
  simAws: SimAws,
  metricName: string,
): Promise<number | undefined> {
  const statistics = new GetMetricStatisticsCommand({
    Namespace: "AWS/Lambda",
    MetricName: metricName,
    Dimensions: [{ Name: "FunctionName", Value: functionName }],
    StartTime: startedAt,
    EndTime: new Date(startedAt.getTime() + 300_000),
    Period: 300,
    Statistics: ["Sum"],
  });
  const { Datapoints } = await simAws
    .cloudWatch()
    .getMetricStatistics(statistics);

  return Datapoints?.at(0)?.Sum;
}

describe("AWS/Lambda metrics a simulated invocation publishes", () => {
  it("counts an invocation that returned", async () => {
    // Given a function bound to a handler that returns.
    const simAws = await simAwsWithFunction();

    // When it is invoked.
    await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: functionName }));
    await simAws.backgroundTasksComplete();

    // Then it counted one invocation, and no error.
    assertIdentical(await counted(simAws, "Invocations"), 1);
    assertUndefined(await counted(simAws, "Errors"));
  });

  it("counts an error where the handler threw", async () => {
    // Given a function whose handler throws.
    const simAws = await simAwsWithFunction(() => {
      throw new Error("order has no items");
    });

    // When it is invoked.
    await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: functionName }));
    await simAws.backgroundTasksComplete();

    // Then the failure counted as an error, and as an invocation too, which is
    // how real Lambda counts one.
    assertIdentical(await counted(simAws, "Errors"), 1);
    assertIdentical(await counted(simAws, "Invocations"), 1);
  });

  it("counts an asynchronous invocation the same way", async () => {
    // Given a function whose handler throws.
    const simAws = await simAwsWithFunction(() => {
      throw new Error("order has no items");
    });

    // When it is invoked as an Event, which answers before the handler runs.
    await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "Event",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the invocation counted once it had actually run.
    assertIdentical(await counted(simAws, "Errors"), 1);
    assertIdentical(await counted(simAws, "Invocations"), 1);
  });

  it("measures duration on the simulation's clock", async () => {
    // Given a handler that takes two seconds of simulated time.
    const simAws = await simAwsWithFunction(async () => {
      await simAws.clock().advanceBy({ seconds: 2 });

      return "done";
    });

    // When it is invoked.
    await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: functionName }));
    await simAws.backgroundTasksComplete();

    // Then the duration is the simulated time it took, rather than however
    // long the host happened to spend on it.
    assertIdentical(await counted(simAws, "Duration"), 2000);
  });

  it("publishes under the function's name, and nothing undimensioned", async () => {
    // Given an invoked function.
    const simAws = await simAwsWithFunction();

    await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: functionName }));
    await simAws.backgroundTasksComplete();

    // Then every metric it published carries the function's name, which is the
    // dimension a CDK alarm on a function reads.
    const { Metrics } = await simAws
      .cloudWatch()
      .listMetrics(new ListMetricsCommand({ Namespace: "AWS/Lambda" }));

    assertArrayEquals(
      (Metrics ?? []).map((metric) => metric.MetricName),
      ["Invocations", "Duration"],
    );
    assertArrayEquals(
      (Metrics ?? []).flatMap((metric) =>
        metric.Dimensions.map(
          (dimension) => `${dimension.Name}=${dimension.Value}`,
        ),
      ),
      [`FunctionName=${functionName}`, `FunctionName=${functionName}`],
    );
  });

  it("answers a GetMetricData query the way a custom metric does", async () => {
    // Given an invoked function.
    const simAws = await simAwsWithFunction();

    await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: functionName }));
    await simAws.backgroundTasksComplete();

    // When the metric is read through GetMetricData.
    const query = new GetMetricDataCommand({
      StartTime: startedAt,
      EndTime: new Date(startedAt.getTime() + 300_000),
      MetricDataQueries: [
        {
          Id: "invocations",
          MetricStat: {
            Metric: {
              Namespace: "AWS/Lambda",
              MetricName: "Invocations",
              Dimensions: [{ Name: "FunctionName", Value: functionName }],
            },
            Period: 300,
            Stat: "Sum",
          },
        },
      ],
    });
    const { MetricDataResults } = await simAws
      .cloudWatch()
      .getMetricData(query);

    // Then it comes back, so nothing about a reserved namespace changes how a
    // metric in one is read.
    assertArrayEquals(MetricDataResults?.at(0)?.Values, [1]);
  });

  it("still refuses a caller putting into the reserved namespace", async () => {
    // Given a simulation.
    const simAws = await simAwsWithFunction();

    // When a caller tries to publish an AWS/Lambda metric of its own.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudWatch().putMetricData(
          new PutMetricDataCommand({
            Namespace: "AWS/Lambda",
            MetricData: [{ MetricName: "Errors", Value: 1 }],
          }),
        ),
    );

    // Then it is refused, as an account refuses one. Lambda's own metrics
    // reach the store by a route a caller has no access to.
    assertInstanceOf(error, SimCloudWatchInvalidParameterValueException);
  });

  it("runs on a simulated Lambda with no CloudWatch to count into", async () => {
    // Given a simulated Lambda built on its own.
    const simLambda = new SimLambda();

    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Role: "arn:aws:iam::888888888888:role/OrdersRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => "done") },
      }),
    );

    // When it is invoked.
    const result = await simLambda.invoke(
      new InvokeCommand({ FunctionName: functionName }),
    );

    // Then the invocation ran and answered. Counting is what it does without,
    // rather than something it fails for the want of.
    assertIdentical(result.StatusCode, 200);
  });
});
