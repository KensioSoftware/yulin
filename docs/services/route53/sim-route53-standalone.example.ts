/**
 * Standalone simulated Route53 instance.
 */

import { CreateHostedZoneCommand } from "@aws-sdk/client-route-53";

import { SimRoute53 } from "@kensio/yulin/route53";

const route53 = new SimRoute53();

const hostedZoneCreation = await route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "standalone.example.test",
    CallerReference: "standalone-zone",
  }),
);

console.log(hostedZoneCreation.HostedZone?.Id);
