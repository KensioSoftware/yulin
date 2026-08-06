/**
 * Registering a simulated Route53 Hosted Zone with a chosen Hosted Zone ID.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const route53 = simAws.route53();

// The Hosted Zone ID a CDK HostedZone.fromLookup baked into the template.
route53.registerHostedZone({
  id: "Z0123456789ABCDEFGHIJ",
  name: "example.test",
});

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "site-stack",
  template: {
    Resources: {
      SiteRecord: {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: "Z0123456789ABCDEFGHIJ",
          Name: "www.example.test",
          Type: "A",
          TTL: "300",
          ResourceRecords: ["192.0.2.10"],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

console.log(stack.getResource("SiteRecord")?.status);
