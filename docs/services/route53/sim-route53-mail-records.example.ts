/**
 * Creating simulated Route53 records a resolver never answers for.
 */

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "mail-zone",
  }),
);

const hostedZoneId = hostedZoneCreation.HostedZone!.Id!;

await simAws.backgroundTasksComplete();

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "example.test",
            Type: "MX",
            TTL: 3600,
            ResourceRecords: [
              { Value: "10 in1-smtp.messagingengine.com." },
              { Value: "20 in2-smtp.messagingengine.com." },
            ],
          },
        },
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "example.test",
            Type: "CAA",
            TTL: 300,
            ResourceRecords: [{ Value: '0 issue "letsencrypt.org"' }],
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

const mailRecord = listOutput.ResourceRecordSets?.find(
  (recordSet) => recordSet.Type === "MX",
);

// [ '10 in1-smtp.messagingengine.com.', '20 in2-smtp.messagingengine.com.' ]
console.log(mailRecord?.ResourceRecords?.map((record) => record.Value));
