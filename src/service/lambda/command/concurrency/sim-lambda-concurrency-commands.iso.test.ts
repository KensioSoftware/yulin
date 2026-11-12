import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import {
  CreateFunctionCommand,
  DeleteFunctionConcurrencyCommand,
  GetFunctionCommand,
  GetFunctionConcurrencyCommand,
  InvokeCommand,
  PublishVersionCommand,
  PutFunctionConcurrencyCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimLambdaInvalidParameterValueException,
  SimLambdaTooManyRequestsException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../function/sim-lambda-handler.type.js";

const startedAt = new Date("2026-08-30T09:00:00.000Z");

/**
 * A simulation with a stopped clock and a settled function of the given name.
 */
async function simAwsWithFunction(
  functionNames: readonly string[] = ["orders"],
  handler: SimLambdaHandler = () => "handled",
): Promise<SimAws> {
  const simAws = new SimAws();
  await simAws.clock().setTo(startedAt);

  for (const functionName of functionNames) {
    // oxlint-disable-next-line no-await-in-loop -- created in order
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
        Code: { ZipFile: makeLambdaZipFileInput(handler) },
      }),
    );
  }
  await simAws.backgroundTasksComplete();

  return simAws;
}

async function reserve(
  simAws: SimAws,
  reserved: number,
  functionName = "orders",
): Promise<void> {
  await simAws.lambda().putFunctionConcurrency(
    new PutFunctionConcurrencyCommand({
      FunctionName: functionName,
      ReservedConcurrentExecutions: reserved,
    }),
  );
}

describe("Lambda reserved concurrency", () => {
  it("reports a reservation through GetFunctionConcurrency and GetFunction, and removes it", async () => {
    // Given a function with 5 reserved.
    const simAws = await simAwsWithFunction();
    await reserve(simAws, 5);

    // When the reservation is read, then removed and read again.
    const reserved = await simAws
      .lambda()
      .getFunctionConcurrency(
        new GetFunctionConcurrencyCommand({ FunctionName: "orders" }),
      );
    const read = await simAws
      .lambda()
      .getFunction(new GetFunctionCommand({ FunctionName: "orders" }));
    await simAws
      .lambda()
      .deleteFunctionConcurrency(
        new DeleteFunctionConcurrencyCommand({ FunctionName: "orders" }),
      );
    const removed = await simAws
      .lambda()
      .getFunctionConcurrency(
        new GetFunctionConcurrencyCommand({ FunctionName: "orders" }),
      );

    // Then both reads report it, and nothing is reserved after removal.
    assertIdentical(reserved.ReservedConcurrentExecutions, 5);
    assertObjectEquals(read.Concurrency, { ReservedConcurrentExecutions: 5 });
    assertUndefined(removed.ReservedConcurrentExecutions);
  });

  it("throttles every invocation of a function with none reserved, and counts it", async () => {
    // Given a function switched off with a reservation of zero.
    const simAws = await simAwsWithFunction();
    await reserve(simAws, 0);

    // When it is invoked.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" })),
    );

    // Then the invocation is throttled as real Lambda throttles one.
    assertInstanceOf(error, SimLambdaTooManyRequestsException);
    assertIdentical(
      error.Reason,
      "ReservedFunctionConcurrentInvocationLimitExceeded",
    );

    // And it is counted as a throttle, never as an invocation.
    await simAws.backgroundTasksComplete();
    const windowEnd = new Date(startedAt.getTime() + 300_000);
    const throttles = new GetMetricStatisticsCommand({
      Namespace: "AWS/Lambda",
      MetricName: "Throttles",
      Dimensions: [{ Name: "FunctionName", Value: "orders" }],
      StartTime: startedAt,
      EndTime: windowEnd,
      Period: 300,
      Statistics: ["Sum"],
    });
    const { Datapoints } = await simAws
      .cloudWatch()
      .getMetricStatistics(throttles);
    assertIdentical(Datapoints?.at(0)?.Sum, 1);
  });

  it("throttles an invocation beyond the reservation while the others run", async () => {
    // Given a function reserving one, whose handler waits to be released.
    const { promise: held, resolve: release } =
      Promise.withResolvers<undefined>();
    const simAws = await simAwsWithFunction(["orders"], async () => {
      await held;

      return "handled";
    });
    await reserve(simAws, 1);

    // When a second invocation arrives while the first is running.
    const first = simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "orders" }));
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().invoke(new InvokeCommand({ FunctionName: "orders" })),
    );
    release(undefined);
    const finished = await first;

    // Then the second is throttled and the first finishes.
    assertInstanceOf(error, SimLambdaTooManyRequestsException);
    assertIdentical(finished.StatusCode, 200);
  });

  it("throttles a published version too, since the reservation covers every version", async () => {
    const simAws = await simAwsWithFunction();
    await simAws
      .lambda()
      .publishVersion(new PublishVersionCommand({ FunctionName: "orders" }));
    await reserve(simAws, 0);

    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .lambda()
        .invoke(new InvokeCommand({ FunctionName: "orders", Qualifier: "1" })),
    );

    assertInstanceOf(error, SimLambdaTooManyRequestsException);
  });

  it("refuses a reservation leaving the account less than 100 unreserved", async () => {
    // Given one function already reserving 500 of the account's 1000.
    const simAws = await simAwsWithFunction(["orders", "invoices"]);
    await reserve(simAws, 500, "invoices");

    // When another asks for 401.
    const error = await assertThrowsErrorAsync(async () =>
      reserve(simAws, 401),
    );

    // Then real Lambda's refusal is reported, and 400 is accepted.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    await reserve(simAws, 400);
  });

  it("refuses a negative reservation", async () => {
    const simAws = await simAwsWithFunction();

    const error = await assertThrowsErrorAsync(async () => reserve(simAws, -1));

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
  });

  it("authorizes lambda:PutFunctionConcurrency", async () => {
    const simAws = await simAwsWithFunction();

    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().putFunctionConcurrency(
        new PutFunctionConcurrencyCommand({
          FunctionName: "orders",
          ReservedConcurrentExecutions: 1,
        }),
        { caller: { kind: "anonymous" } },
      ),
    );

    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "lambda:PutFunctionConcurrency");
  });

  it("reserves the ReservedConcurrentExecutions a template function states", async () => {
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersFunction: {
            Type: "AWS::Lambda::Function",
            Properties: {
              FunctionName: "orders",
              Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
              Handler: "index.handler",
              Runtime: "nodejs22.x",
              Code: { ZipFile: "exports.handler = async () => null;" },
              ReservedConcurrentExecutions: 3,
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    const reserved = await simAws
      .lambda()
      .getFunctionConcurrency(
        new GetFunctionConcurrencyCommand({ FunctionName: "orders" }),
      );

    assertIdentical(reserved.ReservedConcurrentExecutions, 3);
  });
});
