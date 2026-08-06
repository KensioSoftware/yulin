/**
 * Deploying a template that carries a record type sim Route53 does not store.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "signed-dns-stack",
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
          HostedZoneId: { Ref: "SiteZone" },
          Name: "www.example.test",
          Type: "A",
          TTL: "300",
          ResourceRecords: ["192.0.2.1"],
        },
      },
      DelegationSigner: {
        Type: "AWS::Route53::RecordSet",
        Properties: {
          HostedZoneId: { Ref: "SiteZone" },
          Name: "example.test",
          Type: "DS",
          TTL: "3600",
          ResourceRecords: ["12345 13 2 49FD46E6C4B45C55D4AC"],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

// The A record the test is about was created.
console.log(stack.getResource("SiteRecord")?.status);
// "CREATE_COMPLETE"

console.log(stack.skippedResources.map((resource) => resource.logicalId));
// ["DelegationSigner"]

console.log(stack.getResource("DelegationSigner")?.skippedReason);
// "Unsupported sim Route53 CloudFormation Resource DelegationSigner: sim Route53
//  does not model the DS record type, and stores A, AAAA, CAA, CNAME, MX, NS,
//  PTR, SOA, SRV, TXT."
