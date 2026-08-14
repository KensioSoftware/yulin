/**
 * The CloudFormation template the Route53 DNSSEC tests deploy.
 *
 * It is the shape CDK synthesizes for a signed hosted zone, including the key
 * policy statements the `KeySigningKey` construct adds for the
 * `dnssec-route53.amazonaws.com` service principal, so what the tests deploy
 * is what a real app's template holds rather than a tidied version of it.
 *
 * It lives under `test/` for the same reasons as `test/kms/`: eslint rejects a
 * test file that exports helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else, excluded from the published
 * build, not collected as a suite, and not counted in coverage.
 */

import type { CfnTemplateBodyRecord } from "../../src/service/cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../src/service/cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The account root the default key policy delegates to, as CDK writes it. Kept
 * out of the policy literal because a `${...}` placeholder inside a plain
 * string reads as a mistyped template literal.
 */
const accountRootArn = ["arn:aws:iam::$", "{AWS::AccountId}:root"].join("");

/**
 * The key policy CDK's KeySigningKey construct writes onto the signing key.
 */
function keyPolicy(): SimCfnTemplateValueRecord {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: { "Fn::Sub": accountRootArn } },
        Action: "kms:*",
        Resource: "*",
      },
      {
        Effect: "Allow",
        Principal: { Service: "dnssec-route53.amazonaws.com" },
        Action: ["kms:DescribeKey", "kms:GetPublicKey", "kms:Sign"],
        Resource: "*",
        Condition: {
          ArnEquals: {
            "aws:SourceArn": {
              "Fn::Join": [
                "",
                ["arn:aws:route53:::hostedzone/", { Ref: "SiteZone" }],
              ],
            },
          },
        },
      },
      {
        Effect: "Allow",
        Principal: { Service: "dnssec-route53.amazonaws.com" },
        Action: "kms:CreateGrant",
        Resource: "*",
        Condition: { Bool: { "kms:GrantIsForAWSResource": true } },
      },
    ],
  };
}

/**
 * A hosted zone, an ECC_NIST_P256 signing key, a key signing key naming that
 * key, and DNSSEC signing for the zone.
 */
export function simCfnDnssecTemplate(): CfnTemplateBodyRecord {
  return {
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
          KeyPolicy: keyPolicy(),
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
      SigningKeyArn: { Value: { "Fn::GetAtt": ["ZoneSigningKey", "Arn"] } },
      KeySigningKeyId: { Value: { Ref: "ZoneKeySigningKey" } },
      DnssecRef: { Value: { Ref: "ZoneDnssec" } },
    },
  };
}
