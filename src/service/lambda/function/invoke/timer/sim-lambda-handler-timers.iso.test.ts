import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimInvokeCommandOutput } from "../../../command/invoke/invoke.command.js";
import { makeLambdaZipFileInput } from "../../code/lambda-zip-file-input.js";
import { makeLambdaCodeZip } from "../../code/make-lambda-code-zip.js";
import type { SimLambdaHandler } from "../../sim-lambda-handler.type.js";

const functionName = "sleeper";
const roleArn = "arn:aws:iam::888888888888:role/SleeperRole";

/**
 * Wait inside a handler, on whatever `setTimeout` means where it runs.
 */
async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Wait for real time to pass, which is what a test outside an invocation gets
 * from a timer.
 */
async function hostPause(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * A simulation holding one function with room to run for five minutes, backed
 * by a real in-process handler.
 */
async function simAwsWithHandler(handler: SimLambdaHandler): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: roleArn,
      Timeout: 300,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );

  return simAws;
}

/**
 * The same, backed by zip code running in the vm sandbox.
 */
async function simAwsWithZipCode(source: string): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: roleArn,
      Timeout: 300,
      Handler: "index.handler",
      Code: { ZipFile: makeLambdaCodeZip(source) },
    }),
  );

  return simAws;
}

/**
 * Ask for an invocation without waiting for it, so the clock can be moved
 * while the handler is part way through.
 */
function invoking(simAws: SimAws): Promise<SimInvokeCommandOutput> {
  return simAws
    .lambda()
    .invoke(new InvokeCommand({ FunctionName: functionName }));
}

async function answeredWith(
  invocation: Promise<SimInvokeCommandOutput>,
): Promise<unknown> {
  const output = await invocation;
  assertNonNullable(output.Payload, "the invocation answered with a payload");

  return JSON.parse(Buffer.from(output.Payload).toString()) as unknown;
}

describe("the timers a sim Lambda handler is given", () => {
  it("releases a sleeping handler when the clock reaches its timer", async () => {
    // Given a function whose handler sleeps for half a minute.
    const simAws = await simAwsWithHandler(async () => {
      await sleep(30_000);

      return "awake";
    });

    // When it is invoked and simulated time moves on by that long.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 30 });

    // Then the handler woke up and answered, without half a minute of the
    // test run having passed.
    assertIdentical(await answeredWith(invocation), "awake");
  });

  it("leaves a sleeping handler asleep until its own instant arrives", async () => {
    // Given a function whose handler sleeps for half a minute.
    let woke = false;
    const simAws = await simAwsWithHandler(async () => {
      await sleep(30_000);
      woke = true;

      return "awake";
    });

    // When it is invoked and time moves on by less than that.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 29 });

    // Then it is still asleep, and the last second releases it.
    assertFalse(woke, "the handler was still sleeping");
    await simAws.clock().advanceBy({ seconds: 1 });
    assertIdentical(await answeredWith(invocation), "awake");
  });

  it("runs nothing for a timer the handler cleared", async () => {
    // Given a handler that sets a timer and then thinks better of it.
    let fired = false;
    const simAws = await simAwsWithHandler(async () => {
      const timer = setTimeout(() => {
        fired = true;
      }, 5000);
      clearTimeout(timer);
      await sleep(30_000);

      return "done";
    });

    // When it is invoked and time moves well past the cleared timer.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 30 });
    await invocation;

    // Then the callback never ran.
    assertFalse(fired, "the cleared timer stayed cleared");
  });

  it("runs an interval once for each period the clock passes", async () => {
    // Given a handler counting a two second interval while it sleeps.
    let ticks = 0;
    const simAws = await simAwsWithHandler(async () => {
      const interval = setInterval(() => {
        ticks += 1;
      }, 2000);
      await sleep(11_000);
      clearInterval(interval);

      return ticks;
    });

    // When it is invoked and eleven seconds of simulated time pass.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 11 });

    // Then the interval ran once for each of the five periods.
    assertIdentical(await answeredWith(invocation), 5);
  });

  it("gives sandboxed zip code timers on the same clock", async () => {
    // Given zip code that sleeps in the vm sandbox.
    const simAws = await simAwsWithZipCode(`
      exports.handler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 45000));

        return "awake";
      };
    `);

    // When it is invoked and simulated time moves on by that long.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 45 });

    // Then the sandboxed handler woke up too: its timers come from the
    // simulation, as its Date does.
    assertIdentical(await answeredWith(invocation), "awake");
  });

  it("answers with a handle a handler can ask about", async () => {
    // Given a handler that asks its timer to stop holding the process open,
    // as code written for the real runtime is free to.
    const simAws = await simAwsWithHandler(async () => {
      const timer = setTimeout(() => undefined, 5000);
      const held = timer.unref().ref().hasRef();
      clearTimeout(timer);
      await sleep(1000);

      return held;
    });

    // When it is invoked and its sleep falls due.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 1 });

    // Then the handle answered, and a simulated timer holds nothing open.
    assertFalse(await answeredWith(invocation));
  });

  it("gives up the timers an invocation left running", async () => {
    // Given a handler that sets a timer and returns without waiting for it.
    let fired = false;
    const simAws = await simAwsWithHandler(() => {
      setTimeout(() => {
        fired = true;
      }, 5000);

      return "returned";
    });

    // When it is invoked and time moves past what it left behind.
    assertIdentical(await answeredWith(invoking(simAws)), "returned");
    await simAws.clock().advanceBy({ seconds: 30 });

    // Then nothing came of it: the invocation is over, and an execution
    // environment that has answered runs nothing more.
    assertFalse(fired, "the abandoned timer never ran");
  });

  it("keeps each simulation's timers to its own clock", async () => {
    // Given two simulations, each with a handler sleeping ten seconds.
    let slept = false;
    const first = await simAwsWithHandler(async () => {
      await sleep(10_000);

      return "first";
    });
    const second = await simAwsWithHandler(async () => {
      await sleep(10_000);
      slept = true;

      return "second";
    });

    // When both are invoked and only one simulation's clock moves.
    const firstInvocation = invoking(first);
    const secondInvocation = invoking(second);
    await first.clock().advanceBy({ seconds: 10 });

    // Then only that one's handler woke: moving time in one simulation
    // reaches nothing in another.
    assertIdentical(await answeredWith(firstInvocation), "first");
    assertFalse(slept, "the other simulation's handler was still sleeping");

    await second.clock().advanceBy({ seconds: 10 });
    assertIdentical(await answeredWith(secondInvocation), "second");
  });

  it("holds a sleeping handler while host time passes and the clock does not", async () => {
    // Given a handler sleeping five milliseconds, on a stopped clock.
    let woke = false;
    const simAws = await simAwsWithHandler(async () => {
      await sleep(5);
      woke = true;

      return "awake";
    });
    simAws.clock().freeze();

    // When it is invoked and real time passes without simulated time moving.
    const invocation = invoking(simAws);
    await hostPause(30);

    // Then it is still asleep however long the host has been running, and the
    // clock reaching its instant is what wakes it.
    assertFalse(woke, "the handler slept through the host's own time");
    await simAws.clock().advanceBy({ milliseconds: 5 });
    assertIdentical(await answeredWith(invocation), "awake");
  });

  it("gets a handler going again for a timer that asked for no delay", async () => {
    // Given a handler that yields the way ordinary JavaScript yields, on a
    // stopped clock.
    const simAws = await simAwsWithHandler(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve);
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      return "yielded";
    });
    simAws.clock().freeze();

    // When it is invoked and the clock is left where it is.
    // Then it got going again: a timer that asked for no time needs none to
    // pass, however still the simulation's clock is being held.
    assertIdentical(await answeredWith(invoking(simAws)), "yielded");
  });

  it("holds a delay longer than a host timer can measure", async () => {
    // Given a handler that sets a timer forty days out, past the longest
    // delay a host timer holds, and then sleeps for a second.
    let fired = false;
    const simAws = await simAwsWithHandler(async () => {
      setTimeout(
        () => {
          fired = true;
        },
        40 * 24 * 60 * 60 * 1000,
      );
      await sleep(1000);

      return "awake";
    });

    // When it is invoked and a second of simulated time passes.
    const invocation = invoking(simAws);
    await simAws.clock().advanceBy({ seconds: 1 });

    // Then the far-off timer waited where it was put, rather than firing at
    // once as a host timer given a delay it cannot hold does.
    assertIdentical(await answeredWith(invocation), "awake");
    assertFalse(fired, "the far-off timer stayed where it was put");
  });

  it("leaves the host's own timers alone outside an invocation", async () => {
    // Given a simulation whose handler has run, installing the substitutes.
    const simAws = await simAwsWithHandler(() => "done");
    await answeredWith(invoking(simAws));

    // When the test run sets timers of its own, on a clock it never moved.
    let ticks = 0;
    const repeating = setInterval(() => {
      ticks += 1;
    }, 1);
    await hostPause(20);
    clearInterval(repeating);

    // Then they ran in real time, as they would have without a simulation in
    // the process at all.
    assertTrue(ticks > 0, "the host's own interval kept its own time");
  });
});
