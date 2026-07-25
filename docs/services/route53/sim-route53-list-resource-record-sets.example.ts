/**
 * Listing the records in a simulated Route53 Hosted Zone.
 */

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

const createOutput = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "records-listing-zone",
  }),
);

const hostedZoneId = createOutput.HostedZone?.Id;

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "www.example.test",
            Type: "CNAME",
            TTL: 300,
            ResourceRecords: [{ Value: "my-site.s3-website.eu-west-2" }],
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();

const listOutput = await route53.listResourceRecordSets(
  new ListResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
  }),
);

const recordSets = listOutput.ResourceRecordSets ?? [];
for (const recordSet of recordSets) {
  console.log(recordSet.Name, recordSet.Type, recordSet.ResourceRecords);
}
