/**
 * Creating Route53 records through simulated CloudFormation.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "route53-record-stack",
  template: {
    Resources: {
      SiteZone: {
        Type: "AWS::Route53::HostedZone",
        Properties: {
          Name: "example.test",
        },
      },
      SiteRecord: {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: {
            Ref: "SiteZone",
          },
          Name: "www.example.test",
          Type: "A",
          TTL: "300",
          ResourceRecords: ["192.0.2.1"],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();
