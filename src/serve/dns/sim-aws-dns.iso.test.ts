import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../service/aws/sim-aws.js";
import { dnsRcodes } from "../../service/route53/dns/dns-rcode.js";
import {
  dnsInternetClass,
  dnsRecordTypeNumber,
} from "../../service/route53/dns/dns-record-type.js";
import { concatenateBytes } from "../../service/route53/dns/wire/dns-bytes.js";
import { dnsHeaderLength } from "../../service/route53/dns/wire/dns-header.js";
import { encodeDnsName } from "../../service/route53/dns/wire/dns-name.js";
import { SimAwsDns } from "./sim-aws-dns.js";

const queryId = 0xab_cd;

function buildQuery(name: string, opcode = 0): Uint8Array {
  const header = new Uint8Array(dnsHeaderLength);
  const view = new DataView(header.buffer);
  view.setUint16(0, queryId);
  view.setUint16(2, (opcode << 11) | 0x01_00);
  view.setUint16(4, 1);

  const question = new Uint8Array(4);
  new DataView(question.buffer).setUint16(0, dnsRecordTypeNumber("A"));
  new DataView(question.buffer).setUint16(2, dnsInternetClass);

  return concatenateBytes([header, encodeDnsName(name), question]);
}

function responseView(response: Uint8Array): DataView {
  return new DataView(
    response.buffer,
    response.byteOffset,
    response.byteLength,
  );
}

describe("Simulated AWS DNS", () => {
  it("answers a query from the simulated hosted zones", async () => {
    // Given a served environment holding an A record.
    const simAws = new SimAws();
    const route53 = simAws.route53();
    const createOutput = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "example.test",
        CallerReference: "dns-protocol-zone",
      }),
    );
    await route53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: createOutput.HostedZone?.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "api.example.test",
                Type: "A",
                TTL: 60,
                ResourceRecords: [{ Value: "192.0.2.10" }],
              },
            },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When a query datagram arrives.
    const response = new SimAwsDns({ simAws }).handleQuery(
      buildQuery("api.example.test"),
    );

    // Then the response echoes the query ID and carries one answer.
    const view = responseView(response);
    assertIdentical(view.getUint16(0), queryId);
    assertIdentical(view.getUint16(6), 1);
    assertIdentical(view.getUint16(2) & 0x0f, dnsRcodes.noError);
  });

  it("answers a datagram it cannot read with a format error", () => {
    // Given a datagram that is not a valid DNS message.
    const malformed = Uint8Array.of(0xab, 0xcd, 0xff);

    // When it arrives.
    const response = new SimAwsDns().handleQuery(malformed);

    // Then the ID is echoed so the resolver can match the response, and the
    // format error is reported rather than the server failing.
    const view = responseView(response);
    assertIdentical(view.getUint16(0), queryId);
    assertIdentical(view.getUint16(2) & 0x0f, dnsRcodes.formatError);
  });

  it("answers a datagram too short to hold an ID", () => {
    // Given a datagram with no readable ID at all.
    // When it arrives.
    const response = new SimAwsDns().handleQuery(Uint8Array.of(1));

    // Then a format error is still returned rather than nothing.
    const view = responseView(response);
    assertIdentical(view.getUint16(0), 0);
    assertIdentical(view.getUint16(2) & 0x0f, dnsRcodes.formatError);
  });

  it("reports a query it decoded but could not answer as a server failure", async () => {
    // Given an A record stored with a value that is not an address. Route53
    // record changes do not validate address syntax, so this is reachable.
    const simAws = new SimAws();
    const route53 = simAws.route53();
    const createOutput = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "example.test",
        CallerReference: "unencodable-zone",
      }),
    );
    await route53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: createOutput.HostedZone?.Id,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "api.example.test",
                Type: "A",
                TTL: 60,
                ResourceRecords: [{ Value: "not-an-address" }],
              },
            },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When it is queried.
    const response = new SimAwsDns({ simAws }).handleQuery(
      buildQuery("api.example.test"),
    );

    // Then the failure is reported as the server's, not as a malformed query,
    // so the resolver does not conclude it sent something wrong.
    const view = responseView(response);
    assertIdentical(view.getUint16(2) & 0x0f, dnsRcodes.serverFailure);
  });

  it("reports an opcode other than a standard query as not implemented", () => {
    // Given an inverse query, which the simulator does not answer.
    const inverseQuery = buildQuery("api.example.test", 1);

    // When it arrives.
    const response = new SimAwsDns().handleQuery(inverseQuery);

    // Then the opcode is reported unimplemented, with the question echoed.
    const view = responseView(response);
    assertIdentical(view.getUint16(2) & 0x0f, dnsRcodes.notImplemented);
    assertIdentical(view.getUint16(4), 1);
  });
});
