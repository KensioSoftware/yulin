import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { dnsRcodes } from "../dns-rcode.js";
import { dnsRecordTypeNumber } from "../dns-record-type.js";
import { testAnswerer, testQuestion } from "./dns-answerer-test-query.js";
import { createTestZone } from "./dns-answerer-test-zone.js";

describe("Simulated Route53 DNS answers", () => {
  it("answers a record held directly at the queried name", async () => {
    // Given a zone with an A record.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      { name: "api.example.test", type: "A", values: ["192.0.2.10"], ttl: 120 },
    ]);

    // When the name is queried for A.
    const answer = testAnswerer(simAws).answer(
      testQuestion("api.example.test", "A"),
    );

    // Then the record is answered with its own TTL and no authority section.
    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayLength(answer.answers, 1);
    assertIdentical(answer.answers[0].name, "api.example.test");
    assertIdentical(answer.answers[0].ttl, 120);
    assertArrayEquals([...answer.answers[0].rdata], [192, 0, 2, 10]);
    assertArrayEmpty(answer.authority);
  });

  it("returns one resource record per stored value", async () => {
    // Given a record holding several values.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      { name: "many.example.test", type: "TXT", values: ["one", "two"] },
    ]);

    // When the name is queried.
    const answer = testAnswerer(simAws).answer(
      testQuestion("many.example.test", "TXT"),
    );

    // Then each value is its own record, the wire format having no multi-value
    // record.
    assertArrayLength(answer.answers, 2);
  });

  it("follows a CNAME to the record the query asked for", async () => {
    // Given a CNAME pointing at a name that holds an A record.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      {
        name: "www.example.test",
        type: "CNAME",
        values: ["origin.example.test"],
      },
      { name: "origin.example.test", type: "A", values: ["192.0.2.20"] },
    ]);

    // When the CNAME name is queried for A.
    const answer = testAnswerer(simAws).answer(
      testQuestion("www.example.test", "A"),
    );

    // Then both the CNAME and the address it leads to are answered together.
    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayLength(answer.answers, 2);
    assertIdentical(answer.answers[0].type, dnsRecordTypeNumber("CNAME"));
    assertIdentical(answer.answers[1].type, dnsRecordTypeNumber("A"));
    assertIdentical(answer.answers[1].name, "origin.example.test");
  });

  it("answers a CNAME query with the CNAME itself rather than chasing it", async () => {
    // Given a CNAME whose target holds an A record.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      {
        name: "www.example.test",
        type: "CNAME",
        values: ["origin.example.test"],
      },
      { name: "origin.example.test", type: "A", values: ["192.0.2.20"] },
    ]);

    // When the name is queried for CNAME.
    const answer = testAnswerer(simAws).answer(
      testQuestion("www.example.test", "CNAME"),
    );

    // Then only the CNAME is answered, because that is what was asked for.
    assertArrayLength(answer.answers, 1);
    assertIdentical(answer.answers[0].type, dnsRecordTypeNumber("CNAME"));
  });

  it("synthesises an address for a name pointing at a simulated service", async () => {
    // Given a CNAME pointing at a simulated S3 website hostname, which no zone
    // holds an address record for.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      {
        name: "www.example.test",
        type: "CNAME",
        values: ["my-site.s3-website.eu-west-2"],
      },
    ]);

    // When the name is queried for A.
    const answer = testAnswerer(simAws).answer(
      testQuestion("www.example.test", "A"),
    );

    // Then the CNAME is followed by an address record for the local server, so a
    // DNS lookup and an HTTP request for the name reach the same place.
    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayLength(answer.answers, 2);
    assertIdentical(answer.answers[1].name, "my-site.s3-website.eu-west-2");
    assertArrayEquals([...answer.answers[1].rdata], [127, 0, 0, 1]);
  });

  it("resolves an alias record under the name that holds it", async () => {
    // Given an alias record pointing at a simulated CloudFront distribution,
    // which is how Route53 usually fronts one.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      {
        name: "cdn.example.test",
        type: "A",
        values: ["d111111abcdef8.cloudfront.net"],
        alias: true,
      },
    ]);

    // When the alias name is queried for A.
    const answer = testAnswerer(simAws).answer(
      testQuestion("cdn.example.test", "A"),
    );

    // Then the address is answered under the queried name, the alias itself
    // never appearing, which is how Route53 answers an alias.
    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayLength(answer.answers, 1);
    assertIdentical(answer.answers[0].name, "cdn.example.test");
    assertArrayEquals([...answer.answers[0].rdata], [127, 0, 0, 1]);
  });

  it("answers an alias to another record under the alias owner's name", async () => {
    // Given an alias pointing at another record in the same zone, which Route53
    // supports alongside aliases to AWS resources.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      {
        name: "cdn.example.test",
        type: "A",
        values: ["origin.example.test"],
        alias: true,
      },
      { name: "origin.example.test", type: "A", values: ["192.0.2.40"] },
    ]);

    // When the alias name is queried.
    const answer = testAnswerer(simAws).answer(
      testQuestion("cdn.example.test", "A"),
    );

    // Then the target's address is answered under the queried name. Answering it
    // under the target name would leave a resolver with a record it did not ask
    // for and no CNAME explaining the change of name.
    assertArrayLength(answer.answers, 1);
    assertIdentical(answer.answers[0].name, "cdn.example.test");
    assertArrayEquals([...answer.answers[0].rdata], [192, 0, 2, 40]);
  });

  it("answers from the most specific hosted zone holding the name", async () => {
    // Given overlapping zones that both contain the queried name.
    const simAws = new SimAws();
    await createTestZone(simAws, "example.test", [
      { name: "www.sub.example.test", type: "A", values: ["192.0.2.1"] },
    ]);
    await createTestZone(simAws, "sub.example.test", [
      { name: "www.sub.example.test", type: "A", values: ["192.0.2.2"] },
    ]);

    // When the name is queried.
    const answer = testAnswerer(simAws).answer(
      testQuestion("www.sub.example.test", "A"),
    );

    // Then the record from the longer zone name wins.
    assertArrayLength(answer.answers, 1);
    assertArrayEquals([...answer.answers[0].rdata], [192, 0, 2, 2]);
  });

  it("answers records from any simulated Account", async () => {
    // Given a zone created in a non-default Account.
    const simAws = new SimAws();
    await createTestZone(
      simAws,
      "other-account.test",
      [{ name: "api.other-account.test", type: "A", values: ["192.0.2.30"] }],
      simAws.account("111111111111").route53(),
    );

    // When the name is queried through the environment-wide registry.
    const answer = testAnswerer(simAws).answer(
      testQuestion("api.other-account.test", "A"),
    );

    // Then it is answered, because DNS resolution spans Accounts.
    assertArrayLength(answer.answers, 1);
  });
});
