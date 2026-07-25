import dgram from "node:dgram";
import { Resolver } from "node:dns/promises";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";
import type { SimRoute53RecordType } from "../record/sim-route53-record.js";
import { decodeDnsQuery } from "./dns-query.js";
import { dnsRcodes } from "./dns-rcode.js";
import {
  dnsInternetClass,
  dnsRecordTypeNumber,
  simRoute53RecordTypeFromNumber,
} from "./dns-record-type.js";
import { encodeDnsResponse } from "./dns-response.js";
import { encodeDnsRdata } from "./rdata/dns-rdata.js";

interface FixtureRecord {
  readonly name: string;
  readonly type: SimRoute53RecordType;
  readonly value: string;
}

const fixtureRecords: readonly FixtureRecord[] = [
  { name: "www.example.test", type: "A", value: "127.0.0.1" },
  { name: "www.example.test", type: "AAAA", value: "::1" },
  { name: "text.example.test", type: "TXT", value: "hello from yulin" },
  { name: "ns.example.test", type: "NS", value: "ns1.example.test" },
];

/**
 * Answer a decoded query from the fixture records using only the codec, so this
 * exercises the wire format rather than any answer logic the simulator will
 * later grow.
 */
function answerQuery(message: Uint8Array): Uint8Array {
  const query = decodeDnsQuery(message);
  const recordType = simRoute53RecordTypeFromNumber(query.question.type);
  const namedRecords = fixtureRecords.filter(
    (record) => record.name === query.question.name,
  );

  if (namedRecords.length === 0) {
    return encodeDnsResponse({
      id: query.id,
      rcode: dnsRcodes.nameError,
      recursionDesired: query.recursionDesired,
      question: query.question,
    });
  }

  const matching = namedRecords.filter((record) => record.type === recordType);

  return encodeDnsResponse({
    id: query.id,
    rcode: dnsRcodes.noError,
    recursionDesired: query.recursionDesired,
    question: query.question,
    answers: matching.map((record) => ({
      name: record.name,
      type: dnsRecordTypeNumber(record.type),
      class: dnsInternetClass,
      ttl: 60,
      rdata: encodeDnsRdata(record.type, record.value),
    })),
  });
}

describe("DNS message codec against a real resolver", () => {
  const server = dgram.createSocket("udp4");
  const resolver = new Resolver({ timeout: 1000, tries: 1 });

  beforeAll(async () => {
    server.on("message", (message, remote) => {
      server.send(answerQuery(message), remote.port, remote.address);
    });

    await new Promise<void>((resolve) => {
      server.bind(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    resolver.setServers([`127.0.0.1:${String(address.port)}`]);
  });

  afterAll(() => {
    server.close();
  });

  it("answers an A query from a real DNS client", async () => {
    // Given a UDP DNS responder built only from the sim Route53 codec.
    // When Node's resolver, which speaks real DNS over UDP, asks for an A record.
    const addresses = await resolver.resolve4("www.example.test");

    // Then it accepts the response and reads the address back out.
    assertArrayEquals(addresses, ["127.0.0.1"]);
  });

  it("answers an AAAA query from a real DNS client", async () => {
    // Given the same responder.
    // When the resolver asks for an AAAA record.
    const addresses = await resolver.resolve6("www.example.test");

    // Then the IPv6 RDATA decodes back to the original address.
    assertArrayEquals(addresses, ["::1"]);
  });

  it("answers a TXT query, reassembling the character strings", async () => {
    // Given a TXT record in the fixture.
    // When the resolver asks for it.
    const values = await resolver.resolveTxt("text.example.test");

    // Then the character string encoding round-trips through a real client.
    assertArrayEquals(values.flat(), ["hello from yulin"]);
  });

  it("answers an NS query, whose RDATA is an encoded name", async () => {
    // Given an NS record in the fixture.
    // When the resolver asks for it.
    const nameServers = await resolver.resolveNs("ns.example.test");

    // Then the uncompressed name in the RDATA is read back correctly.
    assertArrayEquals(nameServers, ["ns1.example.test"]);
  });

  it("reports a name that does not exist as NXDOMAIN", async () => {
    // Given a name held by no fixture record.
    // When the resolver asks for it.
    const error = await assertThrowsErrorAsync(async () =>
      resolver.resolve4("missing.example.test"),
    );

    // Then the client surfaces it as a not-found rather than a timeout.
    assertInstanceOf(error, Error);
    assertIdentical((error as NodeJS.ErrnoException).code, "ENOTFOUND");
  });

  it("reports a name with no record of that type as NODATA", async () => {
    // Given a name that exists but holds no TXT record.
    // When the resolver asks for TXT.
    const error = await assertThrowsErrorAsync(async () =>
      resolver.resolveTxt("www.example.test"),
    );

    // Then the client distinguishes it from a missing name.
    assertInstanceOf(error, Error);
    assertIdentical((error as NodeJS.ErrnoException).code, "ENODATA");
  });
});
