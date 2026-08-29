import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import { defaultCffHandler } from "../sim-cloudfront-function.js";
import type { SimCreateFunctionCommand } from "../../command/create-function/create-function.command.js";
import type { CffCloudFrontModule } from "../kvs/cff-cloudfront-module.js";
import { cffHandlerFromSource } from "./cff-vm-source-handler.js";

type FunctionCodeInput = SimCreateFunctionCommand["input"]["FunctionCode"];

/**
 * Convert a handler function reference into a Uint8Array for input in the
 * CloudFront CreateFunction Command input FunctionCode.
 */
export function makeCffFunctionCodeInput(
  handlerFunction: CloudFrontFunction.Handler,
): FunctionCodeInput {
  const stowaway = new CffUint8ArrayStowaway();
  stowaway.stowawayHandlerFunction(handlerFunction);
  return stowaway;
}

/**
 * The source a Function reports as the code it was created with.
 *
 * A Function created from source keeps the bytes it was given. One created
 * from a handler function reference was never given any source, so what it
 * keeps is that handler's own source text, which is the code it runs.
 */
export function cffFunctionCodeSource(
  functionCodeInput: FunctionCodeInput,
): Uint8Array {
  if (functionCodeInput instanceof CffUint8ArrayStowaway) {
    return Buffer.from(functionCodeInput.handlerFunction.toString());
  }

  return functionCodeInput ?? new Uint8Array();
}

/**
 * A little trick to allow passing a handler function into CreateFunctionCommand
 * input as if it were a Uint8Array without TypeScript complaining.
 */
export class CffUint8ArrayStowaway extends Uint8Array {
  #handlerFunction: CloudFrontFunction.Handler = defaultCffHandler;

  /**
   * Stowaway the real handler function in this Uint8Array disguise.
   */
  stowawayHandlerFunction(handlerFunction: CloudFrontFunction.Handler): this {
    this.#handlerFunction = handlerFunction;
    return this;
  }

  /**
   * Get the handler function stowed away in this Uint8Array disguise.
   */
  get handlerFunction(): CloudFrontFunction.Handler {
    return this.#handlerFunction;
  }
}

/**
 * Extracts a handler function as a function reference, either from source
 * code in a Uint8Array or from a function-code-input.
 */
export class CffUint8ArrayFunctionCodeExtractor<
  H extends CloudFrontFunction.Handler =
    CloudFrontFunction.ViewerRequestHandler,
> {
  constructor(
    private readonly functionCodeInput: FunctionCodeInput,
    private readonly cloudFront?: CffCloudFrontModule,
  ) {}

  /**
   * Extract the handler function.
   */
  extractHandlerFunction(): H {
    if (this.functionCodeInput instanceof CffUint8ArrayStowaway) {
      return this.functionCodeInput.handlerFunction as H;
    }

    return this.extractUint8ArraySourceCode();
  }

  private extractUint8ArraySourceCode(): H {
    const source = Buffer.from(this.functionCodeInput ?? "").toString();

    return cffHandlerFromSource(source, this.cloudFront) as H;
  }
}
