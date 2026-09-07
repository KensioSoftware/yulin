import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertNumberBetween,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { SimFixedClock } from "../../../../../util/clock/sim-clock.js";
import { makeLambdaZipFileInput } from "../../code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../sim-lambda-handler.type.js";

const functionName = "worker";
const roleArn = "arn:aws:iam::888888888888:role/WorkerRole";
const startedAt = new Date("2026-09-07T09:00:00.000Z");

/** How long the handler waits on the clock before it does its work. */
const handlerDelayMilliseconds = 5;

/**
 * The longest a drain bounded by a one second deadline should take.
 *
 * Well under the five second timer the handler asks for, and well over the
 * deadline, so a loaded host stays inside it.
 */
const drainBoundMilliseconds = 4000;

/**
 * A function that waits on the clock and then records that it worked.
 */
async function functionWaitingOnTheClock(
  simAws: SimAws,
  worked: string[],
  timeoutSeconds?: number,
  delayMilliseconds = handlerDelayMilliseconds,
): Promise<void> {
  const handler: SimLambdaHandler = async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, delayMilliseconds);
    });
    worked.push("worked");

    return "done";
  };

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: roleArn,
      Timeout: timeoutSeconds,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );
}

/**
 * Invoke the function without waiting for it, as an event source does.
 */
async function invokeAsynchronously(simAws: SimAws): Promise<void> {
  await simAws.lambda().invoke(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "Event",
    }),
  );
}

describe("Settling a simulated Lambda invocation that waits on the clock", () => {
  it("waits for a handler timer while simulated time runs", async () => {
    // Given a function whose handler waits on a timer before it works
    const simAws = new SimAws();
    const worked: string[] = [];
    await functionWaitingOnTheClock(simAws, worked);

    // When it is invoked asynchronously and the simulation is asked to settle
    await invokeAsynchronously(simAws);
    await simAws.backgroundTasksComplete();

    // Then the handler has finished, because a running clock reaches the
    // instant the timer waits for without anything moving it
    assertArrayLength(worked, 1);
  });

  it("leaves a handler timer to the clock once time is frozen", async () => {
    // Given the same function in a simulation stopped at an instant
    const simAws = new SimAws();
    const worked: string[] = [];
    await simAws.clock().setTo(startedAt);
    await functionWaitingOnTheClock(simAws, worked);

    // When it is invoked asynchronously and the simulation is asked to settle
    await invokeAsynchronously(simAws);
    await simAws.backgroundTasksComplete();

    // Then it came back with the handler still waiting, since only moving the
    // clock brings the instant it waits for
    assertArrayEmpty(worked);

    // And moving the clock is what releases it
    await simAws.clock().advanceBy(handlerDelayMilliseconds);
    assertArrayLength(worked, 1);
  });

  it("comes back from a clock that stands still under a running mode", async () => {
    // Given the same function in a simulation built on a fixed clock, which
    // reports one instant however long the host runs
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    const worked: string[] = [];
    await functionWaitingOnTheClock(simAws, worked);

    // When it is invoked asynchronously and the simulation is asked to settle
    await invokeAsynchronously(simAws);
    await simAws.backgroundTasksComplete();

    // Then it came back rather than waiting for an instant nothing brings.
    // Simulated time here moves only as far as the clock underneath moves, and
    // a fixed clock moves nowhere. The handler is left where a frozen clock
    // leaves one
    assertArrayEmpty(worked);
  });

  it("bounds the wait for an asynchronous handler by its deadline", async () => {
    // Given a function with one second to answer in, whose handler waits five
    // seconds before it works
    const simAws = new SimAws();
    const worked: string[] = [];
    await functionWaitingOnTheClock(simAws, worked, 1, 5000);

    // When it is invoked asynchronously and the simulation is asked to settle
    const startedAt = Date.now();
    await invokeAsynchronously(simAws);
    await simAws.backgroundTasksComplete();

    // Then the handler that ran out of time did no work, and the drain came
    // back around the deadline rather than waiting out the five second timer.
    // The bound is loose because it is real time on whatever host runs it
    assertArrayEmpty(worked);
    assertNumberBetween(Date.now() - startedAt, 0, drainBoundMilliseconds);
  });

  it("still ends a handler whose timer outlives its deadline", async () => {
    // Given a function with one second to answer in, whose handler waits five
    // seconds before it works
    const simAws = new SimAws();
    const worked: string[] = [];
    await functionWaitingOnTheClock(simAws, worked, 1, 5000);

    // When it is invoked and waited for
    const invoked = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "RequestResponse",
      }),
    );

    // Then the deadline ended it rather than the timer, and settling came back
    // rather than waiting out the five second timer
    assertStringIncludes(String(invoked.FunctionError), "Unhandled");
    await simAws.backgroundTasksComplete();
    assertArrayEmpty(worked);
  });
});
