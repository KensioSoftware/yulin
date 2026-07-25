import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { DnsMessageFormatError } from "../error/dns-message.error.js";
import { encodeDnsAaaaRdata, encodeDnsARdata } from "./dns-address-rdata.js";

describe("DNS A record RDATA", () => {
  it("encodes an IPv4 address as four bytes", () => {
    // Given a dotted-quad address.
    // When it is encoded.
    const rdata = encodeDnsARdata("192.0.2.10");

    // Then it becomes four network-order bytes.
    assertArrayEquals([...rdata], [192, 0, 2, 10]);
  });

  it("rejects an address without four octets", () => {
    const error = assertThrowsError(() => encodeDnsARdata("192.0.2"));

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "expected four dot-separated octets");
  });

  it("rejects an octet outside the byte range", () => {
    const error = assertThrowsError(() => encodeDnsARdata("192.0.2.256"));

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "256 is not an octet");
  });

  it("rejects an empty octet", () => {
    const error = assertThrowsError(() => encodeDnsARdata("192.0..10"));

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "is not an octet");
  });

  it("rejects octets JavaScript number coercion would otherwise accept", () => {
    // Given addresses whose octets are hexadecimal, exponent or signed forms.
    // When each is encoded.
    // Then none is silently converted to some other octet.
    for (const address of ["192.0.2.0x10", "192.0.2.1e2", "192.0.2.+7"]) {
      const error = assertThrowsError(() => encodeDnsARdata(address));

      assertInstanceOf(error, DnsMessageFormatError);
      assertStringIncludes(error.message, "is not an octet");
    }
  });
});

describe("DNS AAAA record RDATA", () => {
  it("encodes a fully written IPv6 address as sixteen bytes", () => {
    // Given an address with all eight groups present.
    // When it is encoded.
    const rdata = encodeDnsAaaaRdata("2001:0db8:0000:0000:0000:0000:0000:0001");

    // Then it becomes sixteen network-order bytes.
    assertIdentical(rdata.byteLength, 16);
    assertArrayEquals([...rdata.subarray(0, 4)], [0x20, 0x01, 0x0d, 0xb8]);
    assertIdentical(rdata[15], 1);
  });

  it("expands the :: shorthand for a run of zero groups", () => {
    // Given the same address written with the zero-run shorthand.
    // When both forms are encoded.
    const shorthand = encodeDnsAaaaRdata("2001:db8::1");
    const written = encodeDnsAaaaRdata("2001:db8:0:0:0:0:0:1");

    // Then they produce the same bytes.
    assertArrayEquals([...shorthand], [...written]);
  });

  it("expands :: at the start and end of an address", () => {
    // Given loopback and a trailing shorthand.
    // When both are encoded.
    const loopback = encodeDnsAaaaRdata("::1");
    const trailing = encodeDnsAaaaRdata("2001:db8::");

    // Then the zero groups land in the right places.
    assertIdentical(loopback[15], 1);
    assertIdentical(loopback[0], 0);
    assertIdentical(trailing[0], 0x20);
    assertIdentical(trailing[15], 0);
  });

  it("rejects more than one :: shorthand", () => {
    const error = assertThrowsError(() => encodeDnsAaaaRdata("2001::db8::1"));

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, '"::" may appear only once');
  });

  it("rejects :: that stands for no zero groups", () => {
    const error = assertThrowsError(() =>
      encodeDnsAaaaRdata("1:2:3:4::5:6:7:8"),
    );

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "at least one zero group");
  });

  it("rejects an address without eight groups and no shorthand", () => {
    const error = assertThrowsError(() => encodeDnsAaaaRdata("2001:db8:1"));

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "expected 8 groups");
  });

  it("rejects a group that is not hexadecimal", () => {
    const error = assertThrowsError(() => encodeDnsAaaaRdata("2001:db8::zzzz"));

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "is not a hex group");
  });
});
