import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import { defaultCffHandler } from "../sim-cloudfront-function.js";
import type { SimCreateFunctionCommand } from "../../command/create-function/create-function.cmd.js";
import vm from "node:vm";

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
 * A little trick to allow passing a handler function into CreateFunctionCommand
 * input as if it were a Uint8Array without TypeScript complaining.
 */
export class CffUint8ArrayStowaway extends Uint8Array {
  private _handlerFunction: CloudFrontFunction.Handler = defaultCffHandler;

  /**
   * Stowaway the real handler function in this Uint8Array disguise.
   */
  stowawayHandlerFunction(handlerFunction: CloudFrontFunction.Handler): this {
    this._handlerFunction = handlerFunction;
    return this;
  }

  /**
   * Get the handler function stowed away in this Uint8Array disguise.
   */
  get handlerFunction(): CloudFrontFunction.Handler {
    return this._handlerFunction;
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
  constructor(private readonly functionCodeInput: FunctionCodeInput) {}

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
    const context = vm.createContext({
      console,
    });
    const script = new vm.Script(`
    ${source}
    handler;
    `);
    const handler: unknown = script.runInContext(context);

    if (typeof handler !== "function") {
      throw new TypeError(
        "CloudFront Function code did not define a handler function",
      );
    }

    return handler as H;
  }
}
