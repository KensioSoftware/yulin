/**
 * Listing simulated Route53 Hosted Zones by name.
 */

import {
  CreateHostedZoneCommand,
  ListHostedZonesByNameCommand,
} from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "z.example.test",
    CallerReference: "z-zone",
  }),
);

await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "a.example.test",
    CallerReference: "a-zone",
  }),
);

await simAws.backgroundTasksComplete();

const listOutput = await route53.listHostedZonesByName(
  new ListHostedZonesByNameCommand({
    DNSName: "example.test",
  }),
);

for (const hostedZone of listOutput.HostedZones ?? []) {
  console.log(hostedZone.Name, hostedZone.Id);
}
