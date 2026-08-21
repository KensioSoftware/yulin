import { GetDNSSECCommand } from "@aws-sdk/client-route-53";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertMapSize,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import { simCfnDnssecTemplate } from "../../../../../test/route53/dnssec-template.js";

async function deployedDnssecStack(
  simAws: SimAws,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "dns-stack",
    template: simCfnDnssecTemplate(),
  });
  await stack.waitForDeployComplete();

  return stack;
}

function output(stack: SimCfnDeployedStack, name: string): string {
  const value = stack.outputs.get(name)?.value;
  assertTypeString(value);

  return value;
}

describe("Route53 DNSSEC CloudFormation Resources", () => {
  it("signs a zone deployed from a template", async () => {
    // Given the shape CDK synthesizes for a signed hosted zone: a signing key,
    // a key signing key naming it, and a DNSSEC Resource for the zone.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const stack = await deployedDnssecStack(simAws);

    // Then all three Resources were created rather than skipped, so the DNSSEC
    // half of the Stack is actually simulated.
    assertFalse(stack.getResource("ZoneSigningKey")?.skipped);
    assertFalse(stack.getResource("ZoneKeySigningKey")?.skipped);
    assertFalse(stack.getResource("ZoneDnssec")?.skipped);

    // And the zone reports itself as signed, with a key a registrar could be
    // given the DS record for.
    const dnssec = await simAws
      .route53()
      .getDnssec(
        new GetDNSSECCommand({ HostedZoneId: output(stack, "ZoneId") }),
      );

    assertIdentical(dnssec.Status?.ServeSignature, "SIGNING");
    assertArrayLength(dnssec.KeySigningKeys ?? [], 1);
    const keySigningKey = dnssec.KeySigningKeys?.[0];
    assertNonNullable(keySigningKey);
    assertIdentical(keySigningKey.Status, "ACTIVE");
    assertStringIncludes(keySigningKey.DSRecord, " 13 2 ");
  });

  it("refers to a key signing key by zone and name", async () => {
    // Given the deployed Stack.
    const simAws = new SimAws();
    const stack = await deployedDnssecStack(simAws);

    // When the key signing key Resource is referred to, then the Ref is the
    // zone ID and the key name joined, which is what CDK's KeySigningKey
    // construct reads as its key signing key ID.
    assertIdentical(
      output(stack, "KeySigningKeyId"),
      `${output(stack, "ZoneId")}|zone_signing_key`,
    );
  });

  it("refers to the DNSSEC Resource by hosted zone", async () => {
    // Given the deployed Stack.
    const simAws = new SimAws();
    const stack = await deployedDnssecStack(simAws);

    // When the DNSSEC Resource is referred to, then it is the zone it signs.
    assertIdentical(output(stack, "DnssecRef"), output(stack, "ZoneId"));
  });

  it("accepts the key policy CDK gives a signing key", async () => {
    // Given the deployed Stack, whose key policy carries the statements CDK's
    // KeySigningKey construct adds for the dnssec-route53 service principal.
    const simAws = new SimAws();
    const stack = await deployedDnssecStack(simAws);

    // When the deployed key is read, then it exists as an ECC_NIST_P256 key:
    // the policy was accepted rather than refused for a principal or condition
    // it does not model.
    const key = simAws.kms().findKey(output(stack, "SigningKeyArn"));

    assertNonNullable(key);
    assertIdentical(key.keySpec.name, "ECC_NIST_P256");
  });

  it("refuses an attribute neither DNSSEC Resource has", async () => {
    // Given a Stack asking for an attribute of a key signing key, which real
    // CloudFormation gives neither DNSSEC Resource type.
    const simAws = new SimAws();
    const template = simCfnDnssecTemplate();

    // When it is deployed, then the reference is refused rather than answered
    // with something invented.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "dns-stack",
        template: {
          ...template,
          Outputs: {
            KeyArn: { Value: { "Fn::GetAtt": ["ZoneKeySigningKey", "Arn"] } },
          },
        },
      });
      await stack.waitForDeployComplete();
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::Route53::KeySigningKey attribute Arn",
    );
  });

  it("refuses a DNSSEC attribute", async () => {
    // Given a Stack asking for an attribute of the DNSSEC Resource.
    const simAws = new SimAws();
    const template = simCfnDnssecTemplate();

    // When it is deployed, then it is refused.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "dns-stack",
        template: {
          ...template,
          Outputs: {
            Status: { Value: { "Fn::GetAtt": ["ZoneDnssec", "Status"] } },
          },
        },
      });
      await stack.waitForDeployComplete();
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::Route53::DNSSEC attribute Status",
    );
  });

  it("refuses a key signing key property that is not a string", async () => {
    // Given a template whose key signing key names its zone as a number.
    const simAws = new SimAws();

    // When it is deployed, then the Resource is refused before a key exists.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "dns-stack",
        template: {
          Resources: {
            ZoneKeySigningKey: {
              Type: "AWS::Route53::KeySigningKey",
              Properties: {
                HostedZoneId: 42,
                KeyManagementServiceArn: "arn:aws:kms:us-east-1:1:key/a",
                Name: "zone_signing_key",
                Status: "ACTIVE",
              },
            },
          },
        },
      });
      await stack.waitForDeployComplete();
    });

    assertStringIncludes(error.message, "HostedZoneId must be a string");
  });

  it("unsigns the zone as the Stack is torn down", async () => {
    // Given the deployed Stack, with its zone signed by an active key.
    const simAws = new SimAws();
    const stack = await deployedDnssecStack(simAws);

    // When the Stack is torn down.
    await stack.teardown();

    // Then every DNSSEC Resource came off, which only happens if signing
    // stopped before the key did and the key was deactivated before deletion.
    assertTrue(stack.getResource("ZoneDnssec")?.deleteComplete);
    assertTrue(stack.getResource("ZoneKeySigningKey")?.deleteComplete);
    assertMapSize(simAws.route53().hostedZones, 0);
  });
});
