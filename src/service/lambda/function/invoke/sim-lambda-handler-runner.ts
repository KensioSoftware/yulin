import type {
  SimLambdaCallback,
  SimLambdaHandler,
} from "../sim-lambda-handler.type.js";
import type { SimLambdaInvokeContextBuilder } from "./sim-lambda-invoke-context-builder.js";

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

function toHandlerError(error: Error | string): Error {
  return error instanceof Error ? error : new Error(error);
}

/**
 * Runs a sim Lambda handler function to completion.
 *
 * Mirrors the completion styles of the real Node.js Lambda runtime: a handler
 * may return a Promise, return a plain value synchronously, or declare the
 * callback parameter and complete through it (including the legacy context
 * done/fail/succeed completions, which are wired to the same callback).
 */
export class SimLambdaHandlerRunner {
  /**
   * Run the handler function for one invocation event.
   * Resolves with the handler result, or rejects with the handler error.
   */
  async run(
    handlerFunction: SimLambdaHandler,
    event: unknown,
    contextBuilder: SimLambdaInvokeContextBuilder,
  ): Promise<unknown> {
    return await new Promise((resolve, reject) => {
      const callback: SimLambdaCallback = (error, result) => {
        if (error === undefined || error === null) {
          resolve(result);
          return;
        }
        reject(toHandlerError(error));
      };

      const context = contextBuilder.build(callback);
      const returned = handlerFunction(event as never, context, callback);

      if (isPromiseLike(returned)) {
        // Bridging handler completion styles inside a promise executor, so
        // this cannot await; the callback path may still settle first.
        // eslint-disable-next-line unicorn/prefer-await
        returned.then(resolve, (error: unknown) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
        return;
      }

      // A handler that does not declare the callback parameter cannot
      // complete through it, so its synchronous return value is the result.
      if (handlerFunction.length < 3) {
        resolve(returned);
      }
    });
  }
}
