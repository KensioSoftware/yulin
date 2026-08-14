/**
 * Deploying a signed Route53 Hosted Zone from CloudFormation.
 */

import { GetDNSSECCommand } from "@aws-sdk/client-route-53";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "dns-stack",
  template: {
    Resources: {
      SiteZone: {
        Type: "AWS::Route53::HostedZone",
        Properties: { Name: "example.test" },
      },
      ZoneSigningKey: {
        Type: "AWS::KMS::Key",
        Properties: {
          KeySpec: "ECC_NIST_P256",
          KeyUsage: "SIGN_VERIFY",
        },
      },
      ZoneKeySigningKey: {
        Type: "AWS::Route53::KeySigningKey",
        Properties: {
          HostedZoneId: { Ref: "SiteZone" },
          KeyManagementServiceArn: { "Fn::GetAtt": ["ZoneSigningKey", "Arn"] },
          Name: "zone_signing_key",
          Status: "ACTIVE",
        },
      },
      ZoneDnssec: {
        Type: "AWS::Route53::DNSSEC",
        Properties: { HostedZoneId: { Ref: "SiteZone" } },
        DependsOn: "ZoneKeySigningKey",
      },
    },
    Outputs: {
      ZoneId: { Value: { Ref: "SiteZone" } },
    },
  },
});
await stack.waitForDeployComplete();

const hostedZoneId = stack.outputs.get("ZoneId")?.value;

if (typeof hostedZoneId !== "string") {
  throw new TypeError("The stack did not output a hosted zone ID");
}

const dnssec = await simAws
  .route53()
  .getDnssec(new GetDNSSECCommand({ HostedZoneId: hostedZoneId }));

console.log(dnssec.Status?.ServeSignature); // "SIGNING"
console.log(dnssec.KeySigningKeys?.[0]?.Status); // "ACTIVE"
