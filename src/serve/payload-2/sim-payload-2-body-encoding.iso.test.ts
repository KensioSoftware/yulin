import { assertFalse, assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimPayload2BodyEncoding } from "./sim-payload-2-body-encoding.js";

describe("Payload format 2.0 body encoding", () => {
  it("treats text media types as text", () => {
    // Given the body encoding rules.
    const encoding = new SimPayload2BodyEncoding();

    // When text-ish content types are checked.
    // Then each is treated as text the handler receives as a string.
    assertTrue(encoding.isText("text/plain; charset=utf-8"));
    assertTrue(encoding.isText("application/json"));
    assertTrue(encoding.isText("APPLICATION/XML"));
    assertTrue(encoding.isText("application/vnd.api+json"));
    assertTrue(encoding.isText("image/svg+xml"));
  });

  it("treats other media types as binary", () => {
    // Given the body encoding rules.
    const encoding = new SimPayload2BodyEncoding();

    // When binary content types are checked.
    // Then each is treated as binary, including a missing content type.
    assertFalse(encoding.isText("application/octet-stream"));
    assertFalse(encoding.isText("image/png"));
    assertFalse(encoding.isText(null));
  });

  it("encodes binary request bodies as base64", () => {
    // Given some bytes that are not text.
    const encoding = new SimPayload2BodyEncoding();
    const bytes = new Uint8Array([0, 1, 2]);

    // When they are encoded for the handler event.
    const body = encoding.encode(bytes, "application/octet-stream");

    // Then the handler receives base64.
    assertIdentical(body, Buffer.from(bytes).toString("base64"));
  });

  it("passes text request bodies through as UTF-8", () => {
    // Given UTF-8 bytes with a text content type.
    const encoding = new SimPayload2BodyEncoding();
    const bytes = new TextEncoder().encode("héllo");

    // When they are encoded for the handler event.
    const body = encoding.encode(bytes, "text/plain");

    // Then the handler receives the decoded string.
    assertIdentical(body, "héllo");
  });

  it("returns response bodies unchanged when not base64", () => {
    // Given a plain handler response body.
    const encoding = new SimPayload2BodyEncoding();

    // When it is decoded for the client.
    const body = encoding.decode("hello", false);

    // Then it is used as it is.
    assertIdentical(body, "hello");
  });
});
