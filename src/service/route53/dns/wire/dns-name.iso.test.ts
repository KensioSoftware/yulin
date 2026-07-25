import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { DnsMessageFormatError } from "../error/dns-message.error.js";
import { decodeDnsName, encodeDnsName } from "./dns-name.js";

describe("DNS name wire format", () => {
  it("encodes labels with a length prefix and a root label", () => {
    // Given a two-label name.
    // When it is encoded.
    const encoded = encodeDnsName("www.test");

    // Then each label is length-prefixed and the name ends with the root label.
    assertArrayEquals(
      [...encoded],
      [3, 0x77, 0x77, 0x77, 4, 0x74, 0x65, 0x73, 0x74, 0],
    );
  });

  it("round-trips a name through encode and decode", () => {
    // Given an encoded multi-label name.
    const encoded = encodeDnsName("a.b.example.test");

    // When it is decoded from the start of the buffer.
    const decoded = decodeDnsName(encoded, 0);

    // Then the original name comes back, with the offset past the root label.
    assertIdentical(decoded.name, "a.b.example.test");
    assertIdentical(decoded.nextOffset, encoded.length);
  });

  it("ignores a trailing dot when encoding", () => {
    // Given the same name in absolute and relative form.
    // When both are encoded.
    const absolute = encodeDnsName("example.test.");
    const relative = encodeDnsName("example.test");

    // Then they produce identical bytes, because the root label is implicit.
    assertArrayEquals([...absolute], [...relative]);
  });

  it("lower-cases decoded labels, because DNS names are case-insensitive", () => {
    // Given a name encoded in mixed case.
    const encoded = encodeDnsName("WWW.Example.TEST");

    // When it is decoded.
    const decoded = decodeDnsName(encoded, 0);

    // Then it matches how sim Route53 stores names.
    assertIdentical(decoded.name, "www.example.test");
  });

  it("rejects a label longer than 63 characters", () => {
    // Given a label over the DNS label limit.
    const longLabel = "a".repeat(64);

    // When it is encoded.
    const error = assertThrowsError(() => encodeDnsName(`${longLabel}.test`));

    // Then the limit is reported.
    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "over the 63 byte limit");
  });

  it("rejects a name longer than 255 bytes", () => {
    // Given four maximum-length labels, which exceed the name limit.
    const label = "a".repeat(63);
    const longName = [label, label, label, label].join(".");

    // When the name is encoded.
    const error = assertThrowsError(() => encodeDnsName(longName));

    // Then the limit is reported.
    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "over the 255 byte limit");
  });

  it("rejects a compression pointer rather than following it", () => {
    // Given a name that begins with a compression pointer.
    const pointer = Uint8Array.of(0xc0, 0x0c);

    // When it is decoded.
    const error = assertThrowsError(() => decodeDnsName(pointer, 0));

    // Then the simulator reports that it does not read compressed names.
    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "uses compression");
  });

  it("rejects a label that runs past the end of the message", () => {
    // Given a label claiming more bytes than the message holds.
    const truncated = Uint8Array.of(3, 0x61, 0x62);

    // When it is decoded.
    const error = assertThrowsError(() => decodeDnsName(truncated, 0));

    // Then the truncation is reported.
    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "runs past the end of the message");
  });

  it("rejects a message that ends before the name does", () => {
    // Given a message with no bytes at the name offset.
    const empty = new Uint8Array(0);

    // When a name is decoded from it.
    const error = assertThrowsError(() => decodeDnsName(empty, 0));

    // Then the missing byte is reported.
    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "ends before offset 0");
  });
});
