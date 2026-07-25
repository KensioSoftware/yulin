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
import { encodeDnsRdata } from "./dns-rdata.js";
import { encodeDnsSoaRdata } from "./dns-soa-rdata.js";
import { encodeDnsTxtRdata } from "./dns-text-rdata.js";

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

describe("DNS SOA record RDATA", () => {
  const soaValue =
    "ns.example.test. hostmaster.example.test. 1 7200 900 1209600 86400";

  it("encodes the two names followed by five intervals", () => {
    // Given a Route53-style SOA value.
    // When it is encoded.
    const rdata = encodeDnsSoaRdata(soaValue);

    // Then the intervals occupy the last twenty bytes, serial first.
    const view = new DataView(rdata.buffer, rdata.byteOffset, rdata.byteLength);
    const intervalsOffset = rdata.length - 20;
    assertIdentical(view.getUint32(intervalsOffset), 1);
    assertIdentical(view.getUint32(intervalsOffset + 4), 7200);
    assertIdentical(view.getUint32(intervalsOffset + 16), 86_400);
  });

  it("rejects a value without seven fields", () => {
    const error = assertThrowsError(() => encodeDnsSoaRdata("ns.test. 1 2"));

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "expected 7 fields, found 3");
  });

  it("rejects an interval that is not a 32-bit number", () => {
    const error = assertThrowsError(() =>
      encodeDnsSoaRdata("ns.test. host.test. 1 7200 900 1209600 nope"),
    );

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "is not a 32-bit interval");
  });
});

describe("DNS RDATA by record type", () => {
  it("encodes each stored record type", () => {
    // Given one value of each sim Route53 record type.
    // When each is encoded for its type.
    // Then CNAME and NS share the name encoding, and the rest use their own.
    assertArrayEquals([...encodeDnsRdata("A", "127.0.0.1")], [127, 0, 0, 1]);
    assertIdentical(encodeDnsRdata("AAAA", "::1").byteLength, 16);
    assertArrayEquals(
      [...encodeDnsRdata("CNAME", "a.test")],
      [1, 0x61, 4, 0x74, 0x65, 0x73, 0x74, 0],
    );
    assertArrayEquals(
      [...encodeDnsRdata("NS", "a.test")],
      [...encodeDnsRdata("CNAME", "a.test")],
    );
    assertArrayEquals([...encodeDnsRdata("TXT", "hi")], [2, 0x68, 0x69]);
    assertArrayEquals(
      [...encodeDnsRdata("SOA", "ns.test. host.test. 1 2 3 4 5")],
      [...encodeDnsSoaRdata("ns.test. host.test. 1 2 3 4 5")],
    );
  });
});
