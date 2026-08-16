import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type {
  SimLambdaCallback,
  SimLambdaContext,
} from "../sim-lambda-handler.type.js";
import { SimLambdaHandlerRunner } from "./sim-lambda-handler-runner.js";
import { SimLambdaInvokeContextBuilder } from "./sim-lambda-invoke-context-builder.js";

const contextBuilder = new SimLambdaInvokeContextBuilder({
  functionName: "runner-test",
  invokedFunctionArn:
    "arn:aws:lambda:eu-west-2:111111111111:function:runner-test",
  timeoutSeconds: 3,
  memorySizeMb: 128,
  logGroupName: "/aws/lambda/test",
  logStreamName: "2026/08/16/[$LATEST]abc",
});

async function yieldEventLoop(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("sim Lambda handler runner", () => {
  it("resolves with the result of an async handler", async () => {
    const runner = new SimLambdaHandlerRunner();

    const result = await runner.run(
      async (event: unknown) => {
        await yieldEventLoop();
        return { echoed: event };
      },
      { hello: "world" },
      contextBuilder,
    );

    assertIdentical(
      (result as { echoed: { hello: string } }).echoed.hello,
      "world",
    );
  });

  it("rejects with the error of a rejecting async handler", async () => {
    const runner = new SimLambdaHandlerRunner();

    const error = await assertThrowsErrorAsync(async () =>
      runner.run(
        async () => {
          await yieldEventLoop();
          throw new Error("async boom");
        },
        {},
        contextBuilder,
      ),
    );

    assertIdentical(error.message, "async boom");
  });

  it("wraps a non-Error rejection in an Error", async () => {
    const runner = new SimLambdaHandlerRunner();

    const error = await assertThrowsErrorAsync(async () =>
      runner.run(
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors
        () => Promise.reject("string boom"),
        {},
        contextBuilder,
      ),
    );

    assertInstanceOf(error, Error);
    assertIdentical(error.message, "string boom");
  });

  it("rejects when the handler throws synchronously", async () => {
    const runner = new SimLambdaHandlerRunner();

    const error = await assertThrowsErrorAsync(async () =>
      runner.run(
        () => {
          throw new Error("sync boom");
        },
        {},
        contextBuilder,
      ),
    );

    assertIdentical(error.message, "sync boom");
  });

  it("resolves with a plain synchronous return value", async () => {
    const runner = new SimLambdaHandlerRunner();

    const result = await runner.run(
      (event: unknown) => ({ echoed: event }),
      { sync: true },
      contextBuilder,
    );

    assertTrue((result as { echoed: { sync: boolean } }).echoed.sync);
  });

  it("resolves through the callback of a callback-style handler", async () => {
    const runner = new SimLambdaHandlerRunner();

    const result = await runner.run(
      (
        _event: unknown,
        _context: SimLambdaContext,
        callback: SimLambdaCallback,
      ) => {
        callback(null, "called back");
      },
      {},
      contextBuilder,
    );

    assertIdentical(result, "called back");
  });

  it("rejects through the callback of a callback-style handler", async () => {
    const runner = new SimLambdaHandlerRunner();

    const error = await assertThrowsErrorAsync(async () =>
      runner.run(
        (
          _event: unknown,
          _context: SimLambdaContext,
          callback: SimLambdaCallback,
        ) => {
          callback(new Error("callback boom"));
        },
        {},
        contextBuilder,
      ),
    );

    assertIdentical(error.message, "callback boom");
  });

  it("wraps a string callback error in an Error", async () => {
    const runner = new SimLambdaHandlerRunner();

    const error = await assertThrowsErrorAsync(async () =>
      runner.run(
        (
          _event: unknown,
          _context: SimLambdaContext,
          callback: SimLambdaCallback,
        ) => {
          callback("string callback boom");
        },
        {},
        contextBuilder,
      ),
    );

    assertInstanceOf(error, Error);
    assertIdentical(error.message, "string callback boom");
  });

  it("completes through the legacy context done/fail/succeed methods", async () => {
    const runner = new SimLambdaHandlerRunner();

    const doneResult = await runner.run(
      (_event: unknown, context: SimLambdaContext) => {
        context.done(undefined, "done result");
      },
      {},
      contextBuilder,
    );
    assertIdentical(doneResult, "done result");

    const succeedResult = await runner.run(
      (_event: unknown, context: SimLambdaContext) => {
        context.succeed("succeed result");
      },
      {},
      contextBuilder,
    );
    assertIdentical(succeedResult, "succeed result");

    const doneError = await assertThrowsErrorAsync(async () =>
      runner.run(
        (_event: unknown, context: SimLambdaContext) => {
          context.done(new Error("done boom"));
        },
        {},
        contextBuilder,
      ),
    );
    assertIdentical(doneError.message, "done boom");

    const failError = await assertThrowsErrorAsync(async () =>
      runner.run(
        (_event: unknown, context: SimLambdaContext) => {
          context.fail(new Error("fail boom"));
        },
        {},
        contextBuilder,
      ),
    );
    assertIdentical(failError.message, "fail boom");
  });
});
