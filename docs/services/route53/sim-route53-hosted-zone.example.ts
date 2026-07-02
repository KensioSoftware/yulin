/**
 * Creating a simulated Route53 Hosted Zone.
 */

import {
  CreateHostedZoneCommand,
  GetHostedZoneCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

const createHostedZoneOutput = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "example.test",
    CallerReference: "example-test-zone",
    HostedZoneConfig: {
      Comment: "Example local test zone",
      PrivateZone: false,
    },
  }),
);

const hostedZoneId = createHostedZoneOutput.HostedZone!.Id!;

await simAws.backgroundTasksComplete();

const getHostedZoneOutput = await route53.getHostedZone(
  new GetHostedZoneCommand({
    Id: hostedZoneId,
  }),
);

console.log(getHostedZoneOutput.HostedZone?.Name);
console.log(getHostedZoneOutput.HostedZone?.ResourceRecordSetCount);
