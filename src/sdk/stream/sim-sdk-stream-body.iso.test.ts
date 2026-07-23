import { describe, it } from "vitest";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { SimSdkStreamAlreadyConsumedError } from "../error/sim-sdk.error.js";
import { simSdkStreamBody } from "./sim-sdk-stream-body.js";

describe("simulated SDK stream body", () => {
  it("transforms to a string like the real SDK", async () => {
    const body = simSdkStreamBody(Readable.from("Hello, world!"));

    assertIdentical(await body.transformToString(), "Hello, world!");
  });

  it("transforms to a string in a given encoding", async () => {
    const body = simSdkStreamBody(Readable.from("Hello, world!"));

    assertIdentical(
      await body.transformToString("base64"),
      Buffer.from("Hello, world!").toString("base64"),
    );
  });

  it("transforms to a byte array", async () => {
    const body = simSdkStreamBody(Readable.from("Hello, world!"));

    const bytes = await body.transformToByteArray();

    assertInstanceOf(bytes, Uint8Array);
    assertBufferEqual(Buffer.from(bytes), Buffer.from("Hello, world!"));
  });

  it("transforms to a web stream", async () => {
    const body = simSdkStreamBody(Readable.from("Hello, world!"));

    const webStream = body.transformToWebStream();

    assertIdentical(await text(webStream), "Hello, world!");
  });

  it("remains readable directly as a Readable stream", async () => {
    const body = simSdkStreamBody(Readable.from("Hello, world!"));

    assertIdentical(await text(body), "Hello, world!");
  });

  it("rejects a second consumption like the real SDK", async () => {
    const body = simSdkStreamBody(Readable.from("Hello, world!"));
    await body.transformToString();

    const error = assertThrowsError(() => body.transformToWebStream());

    assertInstanceOf(error, SimSdkStreamAlreadyConsumedError);
  });
});
