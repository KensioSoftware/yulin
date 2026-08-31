import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { dnsRcodes } from "../dns-rcode.js";
import {
  dnsAnyQueryType,
  dnsInternetClass,
  dnsRecordTypeNumber,
} from "../dns-record-type.js";
import { testAnswerer, testQuestion } from "./dns-answerer-test-query.js";
import { createTestZone } from "./dns-answerer-test-zone.js";

/**
 * The MX wire type number, which the codec has no encoder for and so does not
 * name.
 *
 * https://www.iana.org/assignments/dns-parameters/dns-parameters.xhtml
 */
const mxQueryType = 15;

describe("Simulated Route53 DNS negative answers", () => {
  it("reports no data for a name holding no record of the queried type", async () => {
    // Given a name that exists with an A record but no TXT record.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      { name: "api.example.test", type: "A", values: ["192.0.2.10"] },
    ]);

    // When it is queried for TXT.
    const answer = testAnswerer(simAws).answer(
      testQuestion("api.example.test", "TXT"),
    );

    // Then the name is reported to exist, holding nothing of that type, with the
    // zone SOA telling a resolver how long it may cache that.
    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayEmpty(answer.answers);
    assertArrayLength(answer.authority, 1);
    assertIdentical(answer.authority[0].name, "example.test");
    assertIdentical(answer.authority[0].type, dnsRecordTypeNumber("SOA"));
  });

  it("reports a name the zone does not hold as non-existent", async () => {
    // Given a zone that does not hold the queried name.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      { name: "api.example.test", type: "A", values: ["192.0.2.10"] },
    ]);

    // When a different name in that zone is queried.
    const answer = testAnswerer(simAws).answer(
      testQuestion("missing.example.test", "A"),
    );

    // Then it is a name error, distinguishing it from a name with no such type.
    assertIdentical(answer.rcode, dnsRcodes.nameError);
    assertArrayEmpty(answer.answers);
    assertArrayLength(answer.authority, 1);
  });

  it("refuses a name held by no hosted zone", async () => {
    // Given a simulated environment with one unrelated zone.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", []);

    // When a name outside every zone is queried.
    const answer = testAnswerer(simAws).answer(
      testQuestion("elsewhere.invalid", "A"),
    );

    // Then it is refused rather than reported missing, because the simulator is
    // authoritative only for the zones it holds and cannot say the name does not
    // exist anywhere.
    assertIdentical(answer.rcode, dnsRcodes.refused);
    assertArrayEmpty(answer.answers);
    assertArrayEmpty(answer.authority);
  });

  it("refuses a query in a class other than internet", async () => {
    // Given a zone holding the queried name.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      { name: "api.example.test", type: "A", values: ["192.0.2.10"] },
    ]);

    // When it is queried in the CHAOS class.
    const answer = testAnswerer(simAws).answer({
      name: "api.example.test",
      type: dnsRecordTypeNumber("A"),
      class: 3,
    });

    // Then it is refused, the simulator modelling no class but internet.
    assertIdentical(answer.rcode, dnsRcodes.refused);
  });

  it("reports no data for a query type it cannot encode, such as ANY", async () => {
    // Given a zone holding the queried name.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      { name: "api.example.test", type: "A", values: ["192.0.2.10"] },
    ]);

    // When it is queried with the ANY query type.
    const answer = testAnswerer(simAws).answer({
      name: "api.example.test",
      type: dnsAnyQueryType,
      class: 1,
    });

    // Then it is answered as no data rather than as an error, which is what a
    // resolver expects for a type a zone does not hold.
    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayEmpty(answer.answers);
    assertArrayLength(answer.authority, 1);
  });

  it("reports no data for a stored record type it does not answer, such as MX", async () => {
    // Given a zone holding an MX record, which the simulator stores for a test
    // to assert on rather than for a resolver to act on.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      {
        name: "example.test",
        type: "MX",
        values: ["10 mx1.example.test."],
      },
    ]);

    // When the name is queried for MX.
    const answer = testAnswerer(simAws).answer({
      name: "example.test",
      type: mxQueryType,
      class: dnsInternetClass,
    });

    // Then the record is left out of the answer rather than encoded, and the
    // query is answered as no data, with the zone SOA a resolver caches that
    // against.
    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayEmpty(answer.answers);
    assertArrayLength(answer.authority, 1);
    assertIdentical(answer.authority[0].type, dnsRecordTypeNumber("SOA"));
  });

  it("stops a CNAME cycle instead of following it forever", async () => {
    // Given two CNAME records pointing at each other.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      { name: "a.example.test", type: "CNAME", values: ["b.example.test"] },
      { name: "b.example.test", type: "CNAME", values: ["a.example.test"] },
    ]);

    // When one of them is queried for A.
    const answer = testAnswerer(simAws).answer(
      testQuestion("a.example.test", "A"),
    );

    // Then the chase stops, returning the CNAMEs it followed.
    assertArrayLength(answer.answers, 2);
  });

  it("stops a CNAME chain that is longer than the depth limit", async () => {
    // Given a chain of CNAMEs longer than the simulator follows.
    const simAws = new SimAws();
    const chain = Array.from({ length: 12 }, (_, index) => ({
      name: `c${String(index)}.example.test`,
      type: "CNAME" as const,
      values: [`c${String(index + 1)}.example.test`],
    }));
    await createTestZone(simAws, "example.test", chain);

    // When the head of the chain is queried for A.
    const answer = testAnswerer(simAws).answer(
      testQuestion("c0.example.test", "A"),
    );

    // Then the chase stops at the depth limit rather than following it all.
    assertArrayLength(answer.answers, 9);
  });

  it("reports no data for a CNAME query on a name holding no CNAME", async () => {
    // Given a name that holds only an A record.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      { name: "api.example.test", type: "A", values: ["192.0.2.10"] },
    ]);

    // When it is queried for CNAME.
    const answer = testAnswerer(simAws).answer(
      testQuestion("api.example.test", "CNAME"),
    );

    // Then the name exists holding nothing of that type, and nothing is chased.
    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayEmpty(answer.answers);
  });

  it("returns just the CNAME when it leads outside every zone", async () => {
    // Given a CNAME pointing at a name in no hosted zone, which is also not a
    // simulated service hostname.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      { name: "www.example.test", type: "CNAME", values: ["nowhere.invalid"] },
    ]);

    // When the CNAME name is queried for A.
    const answer = testAnswerer(simAws).answer(
      testQuestion("www.example.test", "A"),
    );

    // Then the CNAME alone is returned without error: the simulator is not
    // authoritative for where it leads, so it cannot report that name missing.
    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayLength(answer.answers, 1);
  });

  it("reports an alias leading outside every zone as non-existent", async () => {
    // Given an alias record pointing at a name nothing answers for. Unlike a
    // CNAME, an alias never appears in the answer, so there is nothing to return.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      {
        name: "cdn.example.test",
        type: "A",
        values: ["nowhere.invalid"],
        alias: true,
      },
    ]);

    // When the alias name is queried for A.
    const answer = testAnswerer(simAws).answer(
      testQuestion("cdn.example.test", "A"),
    );

    // Then it is a name error with no answers at all.
    assertIdentical(answer.rcode, dnsRcodes.nameError);
    assertArrayEmpty(answer.answers);
  });

  it("gives an alias record a default TTL, having none of its own", async () => {
    // Given an alias record, which Route53 stores without a TTL.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      {
        name: "cdn.example.test",
        type: "A",
        values: ["d111111abcdef8.cloudfront.net"],
        alias: true,
      },
    ]);

    // When it is queried.
    const answer = testAnswerer(simAws).answer(
      testQuestion("cdn.example.test", "A"),
    );

    // Then it is answered with a default TTL rather than none at all.
    assertArrayLength(answer.answers, 1);
    assertIdentical(answer.answers[0].ttl, 60);
  });

  it("gives a record stored without a TTL a default one", async () => {
    // Given a record created without a TTL, which the SDK allows.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      {
        name: "api.example.test",
        type: "A",
        values: ["192.0.2.10"],
        ttl: null,
      },
    ]);

    // When it is queried.
    const answer = testAnswerer(simAws).answer(
      testQuestion("api.example.test", "A"),
    );

    // Then it is answered with a default TTL rather than an invalid one.
    assertArrayLength(answer.answers, 1);
    assertIdentical(answer.answers[0].ttl, 60);
  });

  it("stops at a CNAME holding no target value", async () => {
    // Given a CNAME record created with no values at all.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      { name: "www.example.test", type: "CNAME", values: [] },
    ]);

    // When the name is queried for A.
    const answer = testAnswerer(simAws).answer(
      testQuestion("www.example.test", "A"),
    );

    // Then the chase stops rather than following an absent target, and the name
    // is reported to exist holding nothing of that type.
    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayEmpty(answer.answers);
  });

  it("takes the negative answer SOA from the zone the chase ended in", async () => {
    // Given an alias crossing from one hosted zone into another, landing on a
    // name the second zone does not hold. An alias rather than a CNAME, because
    // a CNAME is itself an answer and so never reaches the negative path.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      {
        name: "cdn.example.test",
        type: "A",
        values: ["gone.other.test"],
        alias: true,
      },
    ]);
    await createTestZone(simAws, "other.test", [
      { name: "kept.other.test", type: "A", values: ["192.0.2.50"] },
    ]);

    // When the alias name is queried for A.
    const answer = testAnswerer(simAws).answer(
      testQuestion("cdn.example.test", "A"),
    );

    // Then the SOA comes from the zone authoritative for where the chase ended,
    // which is what a resolver caches the negative answer against.
    assertArrayLength(answer.authority, 1);
    assertIdentical(answer.authority[0].name, "other.test");
    assertIdentical(answer.rcode, dnsRcodes.nameError);
  });

  it("uses a stored SOA record when the zone holds one", async () => {
    // Given a zone with its own SOA record at the apex.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      {
        name: "example.test",
        type: "SOA",
        values: ["ns1.example.test. admin.example.test. 7 7200 900 1209600 60"],
      },
    ]);

    // When a missing name produces a negative answer.
    const answer = testAnswerer(simAws).answer(
      testQuestion("missing.example.test", "A"),
    );

    // Then the stored SOA is used rather than a synthesised one, so its serial
    // appears in the authority record.
    assertArrayLength(answer.authority, 1);
    const rdata = answer.authority[0].rdata;
    const view = new DataView(rdata.buffer, rdata.byteOffset, rdata.byteLength);
    assertIdentical(view.getUint32(rdata.byteLength - 20), 7);
  });
});
