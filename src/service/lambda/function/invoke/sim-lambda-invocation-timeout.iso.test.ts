import { FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { GetMetricStatisticsCommand } from "@aws-sdk/client-cloudwatch";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimInvokeCommandOutput } from "../../command/invoke/invoke.command.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";

const functionName = "slowcoach";
const roleArn = "arn:aws:iam::888888888888:role/SlowcoachRole";
const startedAt = new Date("2026-08-30T09:00:00.000Z");

/**
 * What an Invoke answered with when the handler failed.
 */
interface InvokeFailure {
  readonly functionError: string | undefined;
  readonly errorType: string;
  readonly errorMessage: string;
}

/**
 * A simulation stopped at a known instant, holding one function that has three
 * seconds to answer in.
 */
async function simAwsWithFunction(handler: SimLambdaHandler): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.clock().setTo(startedAt);
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: roleArn,
      Timeout: 3,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );
  await simAws.backgroundTasksComplete();

  return simAws;
}

function invoking(simAws: SimAws): Promise<SimInvokeCommandOutput> {
  return simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: functionName }));
}

async function failedWith(
  invocation: ReturnType<typeof invoking>,
): Promise<InvokeFailure> {
  const output = await invocation;
  assertNonNullable(output.Payload, "the invocation answered with a payload");

  const document = JSON.parse(Buffer.from(output.Payload).toString()) as {
    errorType: string;
    errorMessage: string;
  };

  return { functionError: output.FunctionError, ...document };
}

/** Everything the function wrote to its log group. */
async function loggedLines(simAws: SimAws): Promise<readonly string[]> {
  const { events } = await simAws.logs().filterLogEvents(
    new FilterLogEventsCommand({
      logGroupName: `/aws/lambda/${functionName}`,
    }),
  );

  assertNonNullable(events, "the log group answered with its events");

  return events.map((event) => event.message);
}

/** The `Sum` of one AWS/Lambda metric this function published. */
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

describe("a sim Lambda invocation that runs out of time", () => {
  it("answers the caller with the Lambda timeout error", async () => {
    // Given a function with three seconds to answer in, whose handler sleeps
    // for a minute.
    const simAws = await simAwsWithFunction(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 60_000);
      });

      return "late";
    });

    // When it is invoked and simulated time passes its deadline.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 10 });

    // Then the caller got the error real Lambda reports for a timeout, timed
    // and named as the runtime names it.
    const failure = await failedWith(invocation);
    assertIdentical(failure.functionError, "Unhandled");
    assertIdentical(failure.errorType, "Sandbox.Timedout");
    assertStringIncludes(
      failure.errorMessage,
      "Task timed out after 3.00 seconds",
    );
    assertStringIncludes(failure.errorMessage, "2026-08-30T09:00:03.000Z");
  });

  it("ignores what a handler goes on to do after its deadline", async () => {
    // Given a handler that answers a minute after its three seconds are up,
    // and sets a timer for after that.
    let ranLate = false;
    const simAws = await simAwsWithFunction(async () => {
      setTimeout(() => {
        ranLate = true;
      }, 90_000);
      await new Promise((resolve) => {
        setTimeout(resolve, 60_000);
      });

      return "late";
    });

    // When it is invoked and time passes both the deadline and the answer.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ minutes: 5 });

    // Then the caller still has the timeout, and the timer the invocation
    // left behind never ran.
    const failure = await failedWith(invocation);
    assertIdentical(failure.errorType, "Sandbox.Timedout");
    assertFalse(ranLate, "the abandoned timer never ran");
  });

  it("records the timeout in the function's log group", async () => {
    // Given a function whose handler never answers in time.
    const simAws = await simAwsWithFunction(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 60_000);
      });

      return "late";
    });

    // When it is invoked and its deadline passes.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 10 });
    await invocation;

    // Then the runtime wrote the failure where a test goes looking for it.
    const [line] = await loggedLines(simAws);
    assertNonNullable(line, "the invocation logged something");
    assertStringIncludes(line, "ERROR Invoke Error");
    assertStringIncludes(line, "Sandbox.Timedout");
  });

  it("counts a timeout as an error the function published", async () => {
    // Given a function whose handler never answers in time.
    const simAws = await simAwsWithFunction(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 60_000);
      });

      return "late";
    });

    // When it is invoked and its deadline passes.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 10 });
    await invocation;

    // Then AWS/Lambda counted the invocation and counted it as an error, as
    // it counts a handler that threw.
    assertIdentical(await counted(simAws, "Invocations"), 1);
    assertIdentical(await counted(simAws, "Errors"), 1);
  });

  it("leaves a handler that answers in time alone", async () => {
    // Given a handler that sleeps for one of its three seconds.
    const simAws = await simAwsWithFunction(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });

      return "in time";
    });

    // When it is invoked and time moves past both its sleep and its deadline.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 10 });

    // Then it answered, and nothing counted an error: the deadline it beat is
    // given up with the rest of the invocation.
    const output = await invocation;
    assertUndefined(output.FunctionError);
    assertUndefined(await counted(simAws, "Errors"));
  });

  it("fails the invocation where a timer callback throws", async () => {
    // Given a handler waiting on work a timer of its own does badly.
    const simAws = await simAwsWithFunction(async () => {
      setTimeout(() => {
        throw new Error("timer callback failed");
      }, 1000);
      await new Promise((resolve) => {
        setTimeout(resolve, 2000);
      });

      return "unreached";
    });

    // When it is invoked and the timer falls due.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 2 });

    // Then the invocation failed with what the callback threw, rather than
    // the error escaping into whatever moved the clock.
    const failure = await failedWith(invocation);
    assertIdentical(failure.errorType, "Error");
    assertIdentical(failure.errorMessage, "timer callback failed");
  });
});
