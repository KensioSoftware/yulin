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
 * The Error a rejected handler rejected with.
 *
 * Zip code runs in a vm sandbox with its own realm, so the Error it throws is
 * not an instance of this realm's Error, and stringifying it into the message
 * of a new one would give whoever reads it `Error: Boom` where the handler said
 * `Boom`. A thrown value carrying a string message is rebuilt as an Error of
 * this realm instead, saying what the handler said and keeping the value it
 * threw as the cause.
 */
function toRejectedError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (
    typeof error !== "object" ||
    error === null ||
    typeof (error as Error).message !== "string"
  ) {
    return new Error(String(error));
  }

  return new Error((error as Error).message, { cause: error });
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
        // oxlint-disable-next-line unicorn-js/prefer-await
        returned.then(resolve, (error: unknown) => {
          reject(toRejectedError(error));
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
