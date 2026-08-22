import { describe, it } from "vitest";
import {
  CffUint8ArrayFunctionCodeExtractor,
  makeCffFunctionCodeInput,
} from "./cff-function-code-input.js";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
  assertThrowsErrorLike,
  assertTypeFunction,
} from "@kensio/smartass";
import { CreateFunctionCommand } from "@aws-sdk/client-cloudfront";
import type { SimCreateFunctionCommand } from "../../command/create-function/create-function.command.js";
import { cloudFrontViewerRequestEventFactory } from "../../factory/cloudfront-functions.factory.js";
import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";

const handlerFunction: CloudFrontFunction.ViewerRequestHandler = (
  event: CloudFrontFunction.ViewerRequestEvent,
) => {
  return event.request;
};

describe("CFF function code input conversion", () => {
  it("creates valid Uint8Array input from handler function", () => {
    const functionCodeInput = makeCffFunctionCodeInput(handlerFunction);
    assertInstanceOf(functionCodeInput, Uint8Array);

    const functionCommand: SimCreateFunctionCommand = new CreateFunctionCommand(
      {
        Name: "foobar-cloudfront-function",
        FunctionCode: functionCodeInput,
        FunctionConfig: {
          Comment: "test function code input typing",
          Runtime: "cloudfront-js-2.0",
        },
      },
    );
    assertInstanceOf(functionCommand, CreateFunctionCommand);
  });

  it("extracts handler function reference back out", () => {
    const functionCodeInput = makeCffFunctionCodeInput(handlerFunction);

    const extractor = new CffUint8ArrayFunctionCodeExtractor(functionCodeInput);

    const handler = extractor.extractHandlerFunction();
    assertInstanceOf(handler, Function);

    const cffEvent = cloudFrontViewerRequestEventFactory.make();
    const handlerResponse = handler(cffEvent);
    assertIdentical(handlerResponse, cffEvent.request);
  });

  it("creates handler function from Uint8Array source code", () => {
    const handlerSourceCode = Buffer.from(`
      function handler(event) {
        return event.request;
      }
    `);

    const extractor = new CffUint8ArrayFunctionCodeExtractor(handlerSourceCode);

    const handler = extractor.extractHandlerFunction();
    assertTypeFunction(handler);

    const cffEvent = cloudFrontViewerRequestEventFactory.make();
    const handlerResponse = handler(cffEvent);
    assertIdentical(handlerResponse, cffEvent.request);
  });

  it("throws on non-function handler in source code", () => {
    const handlerSourceCode = Buffer.from(`
      const handler = "this is not a function";
    `);
    const extractor = new CffUint8ArrayFunctionCodeExtractor(handlerSourceCode);

    const error = assertThrowsError(() => extractor.extractHandlerFunction());
    assertInstanceOf(error, TypeError);
  });

  it("bubbles up error from vm", () => {
    const handlerSourceCode = Buffer.from(`
      function foobarNotCalledHandler(event) {
        return event.request;
      }
    `);
    const extractor = new CffUint8ArrayFunctionCodeExtractor(handlerSourceCode);

    const errorLike = assertThrowsErrorLike(() =>
      extractor.extractHandlerFunction(),
    );
    assertIdentical(errorLike.name, "ReferenceError");
  });
});
