import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimLambdaUnsupportedCodeInput } from "../../error/sim-lambda.error.js";
import { defaultLambdaHandler } from "../sim-lambda-handler.type.js";
import {
  LambdaZipFileExtractor,
  LambdaZipFileStowaway,
  makeLambdaZipFileInput,
} from "./lambda-zip-file-input.js";

describe("Lambda zip file code input", () => {
  it("stows away a handler function reference in a Uint8Array disguise", () => {
    const handlerFunction = (event: { name: string }): string =>
      `Hello ${event.name}`;

    const zipFileInput = makeLambdaZipFileInput(handlerFunction);

    assertInstanceOf(zipFileInput, Uint8Array);
    const extractor = new LambdaZipFileExtractor(zipFileInput);
    assertIdentical(extractor.extractHandlerFunction(), handlerFunction);
  });

  it("defaults a fresh stowaway to the default echo handler", () => {
    const stowaway = new LambdaZipFileStowaway();

    assertIdentical(stowaway.handlerFunction, defaultLambdaHandler);
  });

  it("rejects real zip file bytes as unsupported code input", () => {
    const extractor = new LambdaZipFileExtractor(
      Buffer.from("PK real zip bytes"),
    );

    const error = assertThrowsError(() => extractor.extractHandlerFunction());

    assertInstanceOf(error, SimLambdaUnsupportedCodeInput);
    assertIdentical(error.$metadata.httpStatusCode, 400);
  });
});
