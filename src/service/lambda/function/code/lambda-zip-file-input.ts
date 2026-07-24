import {
  defaultLambdaHandler,
  type SimLambdaHandler,
} from "../sim-lambda-handler.type.js";

/**
 * Convert a handler function reference into a Uint8Array for input as the
 * Lambda CreateFunction Command input Code.ZipFile.
 */
export function makeLambdaZipFileInput<TEvent = unknown, TResult = unknown>(
  handlerFunction: SimLambdaHandler<TEvent, TResult>,
): Uint8Array {
  const stowaway = new LambdaZipFileStowaway();
  stowaway.stowawayHandlerFunction(handlerFunction);
  return stowaway;
}

/**
 * A little trick to allow passing a handler function into CreateFunctionCommand
 * input as if it were a zip file Uint8Array without TypeScript complaining.
 */
export class LambdaZipFileStowaway extends Uint8Array {
  #handlerFunction: SimLambdaHandler = defaultLambdaHandler;

  /**
   * Stowaway the real handler function in this Uint8Array disguise.
   */
  stowawayHandlerFunction<TEvent, TResult>(
    handlerFunction: SimLambdaHandler<TEvent, TResult>,
  ): this {
    this.#handlerFunction = handlerFunction;
    return this;
  }

  /**
   * Get the handler function stowed away in this Uint8Array disguise.
   */
  get handlerFunction(): SimLambdaHandler {
    return this.#handlerFunction;
  }
}
