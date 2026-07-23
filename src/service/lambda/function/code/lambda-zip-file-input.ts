import { SimLambdaUnsupportedCodeInput } from "../../error/sim-lambda.error.js";
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

/**
 * Extracts a handler function reference from Lambda function code input.
 *
 * This is the seam where other code inputs can be supported in future, such
 * as source code strings run in a vm context, or real zipped bundles produced
 * by CloudFormation or CDK packaging.
 */
export class LambdaZipFileExtractor {
  constructor(private readonly zipFileInput: Uint8Array) {}

  /**
   * Extract the handler function.
   */
  extractHandlerFunction(): SimLambdaHandler {
    if (this.zipFileInput instanceof LambdaZipFileStowaway) {
      return this.zipFileInput.handlerFunction;
    }

    throw new SimLambdaUnsupportedCodeInput(
      "Sim Lambda only supports handler function references as function " +
        "code; pass Code.ZipFile made with makeLambdaZipFileInput(handler)",
    );
  }
}
