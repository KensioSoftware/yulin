/**
 * Creating a Route53 Hosted Zone through simulated CloudFormation.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "route53-zone-stack",
  template: {
    Resources: {
      SiteZone: {
        Type: "AWS::Route53::HostedZone",
        Properties: {
          Name: "example.test",
          HostedZoneConfig: {
            Comment: "Example hosted zone",
          },
        },
      },
    },
    Outputs: {
      HostedZoneId: {
        Value: {
          Ref: "SiteZone",
        },
      },
      HostedZoneNameServers: {
        Value: {
          "Fn::GetAtt": ["SiteZone", "NameServers"],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

console.log(stack.output("HostedZoneId"));
console.log(stack.outputs.get("HostedZoneNameServers")?.value);
