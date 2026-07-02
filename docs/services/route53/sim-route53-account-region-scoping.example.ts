/**
 * Simulated Route53 Account and Region scoping.
 */

import { CreateHostedZoneCommand } from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const defaultRoute53 = simAws.route53();
const euWest2Route53 = simAws.region("eu-west-2").route53();
const accountRoute53 = simAws.account("111111111111").route53();
const scopedRoute53 = simAws
  .account("222222222222")
  .region("ap-east-1")
  .route53();

await defaultRoute53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "default.example.test",
    CallerReference: "default-zone",
  }),
);

await euWest2Route53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "eu-west-2.example.test",
    CallerReference: "eu-west-2-zone",
  }),
);

await accountRoute53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "account.example.test",
    CallerReference: "account-zone",
  }),
);

await scopedRoute53.createHostedZone(
  new CreateHostedZoneCommand({
    Name: "scoped.example.test",
    CallerReference: "scoped-zone",
  }),
);
