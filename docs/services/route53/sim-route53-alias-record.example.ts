/**
 * Creating a simulated Route53 alias record.
 */

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

const createHostedZoneOutput = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "alias-zone",
  }),
);

const hostedZoneId = createHostedZoneOutput.HostedZone!.Id!;

await simAws.backgroundTasksComplete();

await route53.changeResourceRecordSets(
  new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Changes: [
        {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "app.example.test",
            Type: "A",
            AliasTarget: {
              HostedZoneId: "Z2FDTNDATAQYW2",
              DNSName: "d111111abcdef8.cloudfront.net.",
              EvaluateTargetHealth: false,
            },
          },
        },
      ],
    },
  }),
);

await simAws.backgroundTasksComplete();
