import { assertIdentical, assertInstanceOf } from "@kensio/smartass";
import { describe, it } from "vitest";
import { defaultLambdaHandler } from "../sim-lambda-handler.type.js";
import {
  LambdaZipFileStowaway,
  makeLambdaZipFileInput,
} from "./lambda-zip-file-input.js";

describe("Lambda zip file code input", () => {
  it("stows away a handler function reference in a Uint8Array disguise", () => {
    // Given a real handler function reference.
    const handlerFunction = (event: { name: string }): string =>
      `Hello ${event.name}`;

    // When it is made into CreateFunction ZipFile input.
    const zipFileInput = makeLambdaZipFileInput(handlerFunction);

    // Then the input passes as a Uint8Array carrying the function reference.
    assertInstanceOf(zipFileInput, Uint8Array);
    assertInstanceOf(zipFileInput, LambdaZipFileStowaway);
    assertIdentical(zipFileInput.handlerFunction, handlerFunction);
  });

  it("defaults a fresh stowaway to the default echo handler", () => {
    const stowaway = new LambdaZipFileStowaway();

    assertIdentical(stowaway.handlerFunction, defaultLambdaHandler);
  });
});
