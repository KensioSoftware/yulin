import { setTimeout as hostSleep } from "node:timers/promises";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { makeLambdaCodeZip } from "../code/make-lambda-code-zip.js";
import { makeLambdaZipFileInput } from "../code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";

const functionName = "sleeper";
const roleArn = "arn:aws:iam::888888888888:role/SleeperRole";
const startedAt = new Date("2026-09-10T09:00:00.000Z");

/** What the handler asks for, and what a test has to advance past. */
const sleepMilliseconds = 100;

/**
 * A one second function, so the stall watch reaches its shortest wait rather
 * than the two seconds a default three second function would give it.
 */
const timeoutSeconds = 1;

/** An in-process handler that sleeps on the invocation's timers. */
const sleepingHandler: SimLambdaHandler = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, sleepMilliseconds);
  });

  return "slept";
};

/**
 * An in-process handler with several timers outstanding, the one it waits on
 * neither the first started nor the last.
 */
const crowdedHandler: SimLambdaHandler = async () => {
  await new Promise((resolve) => {
    setTimeout(() => undefined, 900);
    setTimeout(() => undefined, 500);
    setTimeout(resolve, sleepMilliseconds);
    setTimeout(() => undefined, 1200);
  });

  return "slept";
};

/** Zip code that sleeps on the sandbox timers it was given. */
const sleepingSource = `
  exports.handler = async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ${sleepMilliseconds});
    });

    return "slept";
  };
`;

/** What an Invoke answered with when the invocation failed. */
interface InvokeFailure {
  readonly functionError: string | undefined;
  readonly errorType: string;
  readonly errorMessage: string;
}

async function functionSleeping(
  simAws: SimAws,
  zipFile: Uint8Array,
  handlerName?: string,
): Promise<void> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: roleArn,
      Timeout: timeoutSeconds,
      Handler: handlerName,
      Code: { ZipFile: zipFile },
    }),
  );
  await simAws.backgroundTasksComplete();
}

async function invoking(simAws: SimAws): Promise<InvokeFailure> {
  const output = await simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: functionName }));

  assertNonNullable(output.Payload, "the invocation answered with a payload");

  const document = JSON.parse(Buffer.from(output.Payload).toString()) as {
    errorType: string;
    errorMessage: string;
  };

  return { functionError: output.FunctionError, ...document };
}

describe("sim Lambda stalled invocation", () => {
  it("ends an in-process handler waiting on a clock that has stopped", async () => {
    const simAws = new SimAws();
    await functionSleeping(simAws, makeLambdaZipFileInput(sleepingHandler));
    simAws.clock().freeze();

    const failure = await invoking(simAws);

    assertIdentical(failure.functionError, "Unhandled");
    assertIdentical(failure.errorType, "Yulin.StalledInvocation");
    assertStringIncludes(failure.errorMessage, `${sleepMilliseconds} ms timer`);
    assertStringIncludes(
      failure.errorMessage,
      "Simulated time has stood still",
    );
    assertStringIncludes(
      failure.errorMessage,
      "Advance the simulation's clock",
    );
  });

  it("ends zip code waiting on a clock that has stopped", async () => {
    const simAws = new SimAws();
    await functionSleeping(
      simAws,
      makeLambdaCodeZip(sleepingSource),
      "index.handler",
    );
    simAws.clock().freeze();

    const failure = await invoking(simAws);

    assertIdentical(failure.errorType, "Yulin.StalledInvocation");
    assertStringIncludes(failure.errorMessage, `${sleepMilliseconds} ms timer`);
  });

  it("ends an invocation in a simulation whose clock never moves", async () => {
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await functionSleeping(simAws, makeLambdaZipFileInput(sleepingHandler));

    const failure = await invoking(simAws);

    assertIdentical(failure.errorType, "Yulin.StalledInvocation");
    assertStringIncludes(failure.errorMessage, startedAt.toISOString());
  });

  it("names the earliest timer where several are outstanding", async () => {
    const simAws = new SimAws();
    await functionSleeping(simAws, makeLambdaZipFileInput(crowdedHandler));
    simAws.clock().freeze();

    const failure = await invoking(simAws);

    assertIdentical(failure.errorType, "Yulin.StalledInvocation");
    assertStringIncludes(failure.errorMessage, `${sleepMilliseconds} ms timer`);
  });

  it("leaves an invocation the test goes on to release", async () => {
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    await functionSleeping(simAws, makeLambdaZipFileInput(sleepingHandler));

    const invocation = invoking(simAws);
    await simAws.clock().advanceBy(sleepMilliseconds);
    const answer = await invocation;

    assertUndefined(answer.functionError);
  });

  it("leaves a sleeping handler under a running clock alone", async () => {
    const simAws = new SimAws();
    await functionSleeping(simAws, makeLambdaZipFileInput(sleepingHandler));

    const answer = await invoking(simAws);

    assertUndefined(answer.functionError);
  });

  it("leaves a handler that is busy without a timer alone", async () => {
    const simAws = new SimAws();
    const busyHandler: SimLambdaHandler = async () => {
      // Slept on the host rather than on the invocation's timers, so nothing
      // is waiting on the clock however long this takes.
      await hostSleep(1500);

      return "worked";
    };

    await functionSleeping(simAws, makeLambdaZipFileInput(busyHandler));
    simAws.clock().freeze();

    const answer = await invoking(simAws);

    assertUndefined(answer.functionError);
  });
});
