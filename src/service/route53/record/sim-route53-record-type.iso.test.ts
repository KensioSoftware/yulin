import { assertArrayLength, assertObjectMatches } from "@kensio/smartass";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  ListResourceRecordSetsCommand,
  type ResourceRecordSet,
} from "@aws-sdk/client-route-53";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { assertIsSimRoute53HostedZoneId } from "../command/create-hosted-zone/sim-route53-zone-id.js";

interface ZoneRecord {
  readonly type: string;
  readonly zoneName: string;
  readonly recordSet: ResourceRecordSet;
}

/**
 * Records a zone modelling a real one carries, each holding a value in the
 * shape the record really takes: a preference and a mail host, a service
 * priority, weight, port and target, a CAA flag, tag and value, and a name.
 */
const zoneRecords: readonly ZoneRecord[] = [
  {
    type: "MX",
    zoneName: "example.test",
    recordSet: {
      Name: "example.test",
      Type: "MX",
      TTL: 3600,
      ResourceRecords: [
        { Value: "10 mx1.example.test." },
        { Value: "20 mx2.example.test." },
      ],
    },
  },
  {
    type: "SRV",
    zoneName: "example.test",
    recordSet: {
      Name: "_sip._tcp.example.test",
      Type: "SRV",
      TTL: 300,
      ResourceRecords: [{ Value: "10 60 5060 sipserver.Example.test." }],
    },
  },
  {
    type: "CAA",
    zoneName: "example.test",
    recordSet: {
      Name: "example.test",
      Type: "CAA",
      TTL: 300,
      ResourceRecords: [{ Value: '0 issue "letsencrypt.org"' }],
    },
  },
  {
    type: "PTR",
    zoneName: "2.0.192.in-addr.arpa",
    recordSet: {
      Name: "1.2.0.192.in-addr.arpa",
      Type: "PTR",
      TTL: 300,
      ResourceRecords: [{ Value: "www.Example.test." }],
    },
  },
];

describe("Simulated Route53 record types", () => {
  it.each(zoneRecords)(
    "round-trips a $type record through change and list",
    async ({ type, zoneName, recordSet }) => {
      // Given a Hosted Zone holding a record of the type.
      const simAws = new SimAws();
      const simRoute53 = simAws.route53();

      const hostedZoneCreation = await simRoute53.createHostedZone(
        new CreateHostedZoneCommand({
          Name: zoneName,
          CallerReference: `${type}-record-type-test`,
        }),
      );
      const hostedZoneId = hostedZoneCreation.HostedZone?.Id;
      assertIsSimRoute53HostedZoneId(hostedZoneId);

      await simRoute53.changeResourceRecordSets(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Changes: [{ Action: "CREATE", ResourceRecordSet: recordSet }],
          },
        }),
      );
      await simAws.backgroundTasksComplete();

      // When the Hosted Zone's records are listed.
      const listOutput = await simRoute53.listResourceRecordSets(
        new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
      );

      // Then the record comes back holding the values it was given, each stored
      // as written rather than taken apart into the parts of the record or
      // folded to a DNS name.
      assertArrayLength(listOutput.ResourceRecordSets, 1);
      assertObjectMatches(listOutput.ResourceRecordSets[0], {
        Name: `${recordSet.Name ?? ""}.`,
        Type: recordSet.Type,
        TTL: recordSet.TTL,
        ResourceRecords: recordSet.ResourceRecords,
      });
    },
  );
});
