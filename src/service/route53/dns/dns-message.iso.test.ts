import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { decodeDnsQuery } from "./dns-query.js";
import { dnsRcodes } from "./dns-rcode.js";
import { encodeDnsResponse } from "./dns-response.js";
import {
  dnsAnyQueryType,
  dnsInternetClass,
  dnsRecordTypeNumber,
  simRoute53RecordTypeFromNumber,
} from "./dns-record-type.js";
import { DnsMessageFormatError } from "./error/dns-message.error.js";
import { concatenateBytes } from "./wire/dns-bytes.js";
import { decodeDnsHeader, dnsHeaderLength } from "./wire/dns-header.js";
import { encodeDnsName } from "./wire/dns-name.js";
import { decodeDnsQuestion } from "./wire/dns-question.js";

/**
 * Build a query datagram the way a resolver would, so decoding is exercised
 * against bytes rather than against the encoder's own output.
 */
function buildQuery(
  name: string,
  type: number,
  options: { readonly questionCount?: number; readonly id?: number } = {},
): Uint8Array {
  const header = new Uint8Array(dnsHeaderLength);
  const view = new DataView(header.buffer);
  view.setUint16(0, options.id ?? 0x12_34);
  // Recursion desired, which is what a stub resolver sends.
  view.setUint16(2, 0x01_00);
  view.setUint16(4, options.questionCount ?? 1);

  const question = new Uint8Array(4);
  new DataView(question.buffer).setUint16(0, type);
  new DataView(question.buffer).setUint16(2, dnsInternetClass);

  return concatenateBytes([header, encodeDnsName(name), question]);
}

describe("DNS query decoding", () => {
  it("decodes the header and question of a standard query", () => {
    // Given a standard A query for a name.
    const message = buildQuery("www.example.test", 1);

    // When it is decoded.
    const query = decodeDnsQuery(message);

    // Then the ID, opcode, flags and question all come back.
    assertIdentical(query.id, 0x12_34);
    assertIdentical(query.opcode, 0);
    assertTrue(query.recursionDesired);
    assertIdentical(query.question.name, "www.example.test");
    assertIdentical(query.question.type, 1);
    assertIdentical(query.question.class, dnsInternetClass);
  });

  it("rejects a message shorter than the header", () => {
    const error = assertThrowsError(() =>
      decodeDnsQuery(new Uint8Array(dnsHeaderLength - 1)),
    );

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "shorter than the 12 byte header");
  });

  it("rejects a query that does not carry exactly one question", () => {
    const error = assertThrowsError(() =>
      decodeDnsQuery(buildQuery("www.example.test", 1, { questionCount: 2 })),
    );

    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "carries 2 questions");
  });

  it("rejects a question missing its type and class", () => {
    // Given a message whose question ends right after the name.
    const header = new Uint8Array(dnsHeaderLength);
    new DataView(header.buffer).setUint16(4, 1);
    const truncated = concatenateBytes([header, encodeDnsName("a.test")]);

    // When it is decoded.
    const error = assertThrowsError(() => decodeDnsQuery(truncated));

    // Then the missing fixed fields are reported.
    assertInstanceOf(error, DnsMessageFormatError);
    assertStringIncludes(error.message, "missing its type and class");
  });

  it("ignores anything after the question, such as an EDNS0 OPT record", () => {
    // Given a query with trailing bytes standing in for an additional section.
    const message = concatenateBytes([
      buildQuery("www.example.test", 1),
      Uint8Array.of(0, 0, 41, 0x10, 0, 0, 0, 0, 0, 0, 0),
    ]);

    // When it is decoded.
    const query = decodeDnsQuery(message);

    // Then the question is read and the trailing section is left alone.
    assertIdentical(query.question.name, "www.example.test");
  });
});

describe("DNS response encoding", () => {
  it("echoes the query ID and question, and marks the answer authoritative", () => {
    // Given a decoded query.
    const query = decodeDnsQuery(buildQuery("www.example.test", 1));

    // When a response with one answer is encoded.
    const response = encodeDnsResponse({
      id: query.id,
      rcode: dnsRcodes.noError,
      recursionDesired: query.recursionDesired,
      question: query.question,
      answers: [
        {
          name: query.question.name,
          type: 1,
          class: dnsInternetClass,
          ttl: 60,
          rdata: Uint8Array.of(127, 0, 0, 1),
        },
      ],
    });

    // Then the header reports one question and one answer, and echoes the ID.
    const header = decodeDnsHeader(response);
    assertIdentical(header.id, 0x12_34);
    assertIdentical(header.questionCount, 1);
    assertTrue(header.recursionDesired);

    const view = new DataView(response.buffer);
    assertIdentical(view.getUint16(6), 1);
    // QR and AA set, recursion desired echoed, RCODE 0.
    assertIdentical(view.getUint16(2), 0x85_00);

    // And the echoed question matches what was asked.
    const { question } = decodeDnsQuestion(response, dnsHeaderLength);
    assertIdentical(question.name, "www.example.test");
    assertIdentical(question.type, 1);
  });

  it("encodes a name error with an SOA in the authority section", () => {
    // Given a query for a name that does not exist.
    const query = decodeDnsQuery(buildQuery("missing.example.test", 1));

    // When an NXDOMAIN response carrying the zone SOA is encoded.
    const response = encodeDnsResponse({
      id: query.id,
      rcode: dnsRcodes.nameError,
      recursionDesired: query.recursionDesired,
      question: query.question,
      authority: [
        {
          name: "example.test",
          type: dnsRecordTypeNumber("SOA"),
          class: dnsInternetClass,
          ttl: 900,
          rdata: Uint8Array.of(0),
        },
      ],
    });

    // Then the counts and RCODE reflect a negative answer.
    const view = new DataView(response.buffer);
    assertIdentical(view.getUint16(6), 0);
    assertIdentical(view.getUint16(8), 1);
    assertIdentical(view.getUint16(2) & 0x0f, dnsRcodes.nameError);
    // No OPT record is ever returned.
    assertIdentical(view.getUint16(10), 0);
  });

  it("encodes a format error with no question echoed", () => {
    // Given a message too malformed to yield a question.
    // When a format error response is encoded.
    const response = encodeDnsResponse({
      id: 7,
      rcode: dnsRcodes.formatError,
      recursionDesired: false,
    });

    // Then the response is just a header reporting no sections.
    assertIdentical(response.byteLength, dnsHeaderLength);
    const view = new DataView(response.buffer);
    assertIdentical(view.getUint16(4), 0);
    assertIdentical(view.getUint16(2) & 0x0f, dnsRcodes.formatError);
  });
});

describe("DNS record types", () => {
  it("maps sim Route53 record types to and from wire numbers", () => {
    // Given the record types sim Route53 stores.
    // When they are converted to wire numbers and back.
    // Then each round-trips.
    assertArrayEquals(
      [
        dnsRecordTypeNumber("A"),
        dnsRecordTypeNumber("NS"),
        dnsRecordTypeNumber("CNAME"),
        dnsRecordTypeNumber("SOA"),
        dnsRecordTypeNumber("TXT"),
        dnsRecordTypeNumber("AAAA"),
      ],
      [1, 2, 5, 6, 16, 28],
    );
    assertIdentical(simRoute53RecordTypeFromNumber(5), "CNAME");
    assertIdentical(simRoute53RecordTypeFromNumber(28), "AAAA");
  });

  it("returns no record type for a query type the simulator cannot encode", () => {
    // Given the ANY query type and an unassigned type number.
    // When they are converted.
    // Then neither maps to a stored record type.
    assertUndefined(simRoute53RecordTypeFromNumber(dnsAnyQueryType));
    assertUndefined(simRoute53RecordTypeFromNumber(65_280));
  });
});
