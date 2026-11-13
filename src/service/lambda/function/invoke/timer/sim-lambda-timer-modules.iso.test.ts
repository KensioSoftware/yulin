import { setTimeout as timersSetTimeout } from "node:timers";
import { scheduler, setTimeout as sleepFor } from "node:timers/promises";
import { promisify } from "node:util";

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimInvokeCommandOutput } from "../../../command/invoke/invoke.command.js";
import { makeLambdaZipFileInput } from "../../code/lambda-zip-file-input.js";
import { makeLambdaCodeZip } from "../../code/make-lambda-code-zip.js";
import type { SimLambdaHandler } from "../../sim-lambda-handler.type.js";

const functionName = "sleeper";
const roleArn = "arn:aws:iam::888888888888:role/SleeperRole";

async function simAwsWithCode(
  code: Uint8Array,
  handlerName?: string,
): Promise<SimAws> {
  const simAws = new SimAws();
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: roleArn,
      Timeout: 300,
      Handler: handlerName,
      Code: { ZipFile: code },
    }),
  );

  return simAws;
}

async function invokedAfter(simAws: SimAws, seconds: number): Promise<unknown> {
  const invocation: Promise<SimInvokeCommandOutput> = simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: functionName }));
  await simAws.clock().advanceBy({ seconds });
  const { Payload } = await invocation;
  assertNonNullable(Payload, "the invocation answered with a payload");

  return JSON.parse(Buffer.from(Payload).toString()) as unknown;
}

describe("the timer modules a sim Lambda handler imports", () => {
  it("releases a handler sleeping on node:timers/promises when the clock reaches it", async () => {
    // Given a handler sleeping for two minutes on the promise timer it imported.
    const handler: SimLambdaHandler = async () =>
      await sleepFor(120_000, "awake");
    const simAws = await simAwsWithCode(makeLambdaZipFileInput(handler));

    // When it is invoked and simulated time moves on by two minutes.
    // Then it answers, without two minutes of the test run passing.
    assertIdentical(await invokedAfter(simAws, 120), "awake");
  });

  it("runs node:timers, scheduler.wait and a promisified setTimeout on the clock", async () => {
    const handler: SimLambdaHandler = async () => {
      await new Promise((resolve) => {
        timersSetTimeout(resolve, 60_000);
      });
      await scheduler.wait(60_000);
      await promisify(setTimeout)(60_000);

      return "awake";
    };
    const simAws = await simAwsWithCode(makeLambdaZipFileInput(handler));

    assertIdentical(await invokedAfter(simAws, 180), "awake");
  });

  it("rejects a promise timer whose signal aborts", async () => {
    const handler: SimLambdaHandler = async () => {
      const controller = new AbortController();
      const sleeping = sleepFor(60_000, "awake", {
        signal: controller.signal,
      });
      controller.abort();

      try {
        return await sleeping;
      } catch (error) {
        return (error as Error).name;
      }
    };
    const simAws = await simAwsWithCode(makeLambdaZipFileInput(handler));

    assertIdentical(await invokedAfter(simAws, 0), "AbortError");
  });

  it("gives zip code the same timer modules", async () => {
    const simAws = await simAwsWithCode(
      makeLambdaCodeZip(
        'const { setTimeout } = require("node:timers/promises");\n' +
          'exports.handler = async () => setTimeout(120000, "awake");',
      ),
      "index.handler",
    );

    assertIdentical(await invokedAfter(simAws, 120), "awake");
  });

  it("leaves the promise timer on real time outside an invocation", async () => {
    // Given the patch installed by an earlier invocation.
    const simAws = await simAwsWithCode(
      makeLambdaZipFileInput(async () => await sleepFor(1, "done")),
    );
    await invokedAfter(simAws, 1);

    // When the test itself sleeps, and aborts a sleep.
    const slept = await sleepFor(1, "slept");
    const error = await assertThrowsErrorAsync(async () =>
      sleepFor(1, "never", { signal: AbortSignal.abort() }),
    );

    // Then the host promise timer answered both.
    assertIdentical(slept, "slept");
    assertInstanceOf(error, Error);
  });
});
