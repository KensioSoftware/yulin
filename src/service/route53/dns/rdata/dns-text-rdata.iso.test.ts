import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { encodeDnsTxtRdata } from "./dns-text-rdata.js";

describe("DNS TXT record RDATA", () => {
  it("encodes a value as one length-prefixed character string", () => {
    // Given a short TXT value.
    // When it is encoded.
    const rdata = encodeDnsTxtRdata("hello");

    // Then it is a length byte followed by the text.
    assertArrayEquals([...rdata], [5, 0x68, 0x65, 0x6c, 0x6c, 0x6f]);
  });

  it("splits a value longer than 255 bytes across character strings", () => {
    // Given a value over the single character string limit.
    const value = "a".repeat(300);

    // When it is encoded.
    const rdata = encodeDnsTxtRdata(value);

    // Then it becomes two character strings covering the whole value.
    assertIdentical(rdata[0], 255);
    assertIdentical(rdata[256], 45);
    assertIdentical(rdata.byteLength, 1 + 255 + 1 + 45);
  });

  it("encodes an empty value as one empty character string", () => {
    // Given an empty TXT value, which is still a valid record value.
    // When it is encoded.
    const rdata = encodeDnsTxtRdata("");

    // Then it is a single zero length byte.
    assertArrayEquals([...rdata], [0]);
  });

  it("encodes a non-ASCII value as UTF-8 bytes", () => {
    // Given a TXT value with a multi-byte character.
    // When it is encoded.
    const rdata = encodeDnsTxtRdata("caffè");

    // Then the length byte counts bytes rather than characters.
    assertIdentical(rdata[0], 6);
    assertIdentical(rdata.byteLength, 7);
  });
});
