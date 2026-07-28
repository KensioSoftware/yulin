import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimKmsKey } from "../key/sim-kms-key.js";
import { SimKmsCfnResourceFactory } from "./sim-cfn-kms-resource-factory.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

function kmsResource(
  resourceType: string,
  properties: SimCfnTemplateValueRecord,
): SimCfnResource {
  return new SimCfnResource({
    accountRegionScope: {
      accountId: accountIdOneOnes,
      regionName: "eu-west-2",
    },
    logicalId: "BadKey",
    template: { Type: resourceType, Properties: properties },
  });
}

/**
 * Create a KMS Resource straight through the Resource factory, returning
 * whatever it rejects with. Keeps the property rules under test without a
 * whole stack.
 */
async function createKmsResource(
  resourceTypeName: string,
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
  const factory = new SimKmsCfnResourceFactory({ kms: simAws.kms() });

  try {
    await factory.create(
      resourceTypeName,
      kmsResource(`AWS::KMS::${resourceTypeName}`, properties),
      { simAws, resources: new Map() },
    );
  } catch (error) {
    assertInstanceOf(error, Error);

    return error;
  }

  throw new Error(`Expected ${resourceTypeName} creation to reject`);
}

describe("KMS CloudFormation Resource validation", () => {
  it("refuses EnableKeyRotation", async () => {
    // Given a template asking for automatic key rotation, which simulated KMS
    // does not model.
    // When the Resource is created, then it is refused rather than deploying a
    // key whose material never actually rotates.
    const error = await createKmsResource("Key", { EnableKeyRotation: true });

    assertStringIncludes(error.message, "AWS::KMS::Key Resource BadKey");
    assertStringIncludes(error.message, "EnableKeyRotation is not simulated");
  });

  it("accepts EnableKeyRotation false, which is the AWS default", async () => {
    // Given a template turning rotation explicitly off, as CDK synthesises.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const factory = new SimKmsCfnResourceFactory({ kms: simAws.kms() });

    // When the Resource is created.
    const created = await factory.create(
      "Key",
      kmsResource("AWS::KMS::Key", { EnableKeyRotation: false }),
      { simAws, resources: new Map() },
    );

    // Then it deploys, because it asked for nothing that is not simulated.
    assertInstanceOf(created, SimKmsKey);
  });

  it("refuses RotationPeriodInDays", async () => {
    // Given a template setting a rotation period.
    // When the Resource is created, then it is refused.
    const error = await createKmsResource("Key", {
      RotationPeriodInDays: 180,
    });

    assertStringIncludes(
      error.message,
      "RotationPeriodInDays is not simulated",
    );
  });

  it("refuses MultiRegion", async () => {
    // Given a template asking for a multi-Region key, whose whole point is a
    // replica in another region that simulated KMS cannot produce.
    // When the Resource is created, then it is refused.
    const error = await createKmsResource("Key", { MultiRegion: true });

    assertStringIncludes(error.message, "MultiRegion is not simulated");
  });

  it("refuses Tags", async () => {
    // Given a template tagging the key, which simulated KMS neither stores nor
    // matches in a policy condition.
    // When the Resource is created, then it is refused rather than dropping
    // the tags silently.
    const error = await createKmsResource("Key", {
      Tags: [{ Key: "component", Value: "database" }],
    });

    assertStringIncludes(error.message, "Tags are not simulated on KMS keys");
  });

  it("refuses an asymmetric KeySpec", async () => {
    // Given a template asking for an asymmetric key.
    // When the Resource is created, then CreateKey refuses it in the same
    // terms it refuses an SDK caller.
    const error = await createKmsResource("Key", {
      KeySpec: "RSA_2048",
      KeyUsage: "ENCRYPT_DECRYPT",
    });

    assertStringIncludes(error.message, "KeySpec 'RSA_2048' is not simulated");
  });

  it("refuses an HMAC KeyUsage", async () => {
    // Given a template asking for an HMAC key.
    // When the Resource is created, then it is refused.
    const error = await createKmsResource("Key", {
      KeyUsage: "GENERATE_VERIFY_MAC",
    });

    assertStringIncludes(
      error.message,
      "KeyUsage 'GENERATE_VERIFY_MAC' is not simulated",
    );
  });

  it("refuses imported key material", async () => {
    // Given a template asking for a key whose material comes from outside KMS.
    // When the Resource is created, then it is refused.
    const error = await createKmsResource("Key", { Origin: "EXTERNAL" });

    assertStringIncludes(error.message, "Origin 'EXTERNAL' is not simulated");
  });

  it("refuses a KeyPolicy that is not a policy document", async () => {
    // Given a template whose KeyPolicy is a list rather than a document.
    // When the Resource is created, then it is refused where the mistake was
    // made rather than at some later authorization.
    const error = await createKmsResource("Key", { KeyPolicy: ["allow"] });

    assertStringIncludes(error.message, "KeyPolicy must be an object");
  });

  it("refuses a non-string Description", async () => {
    // Given a template whose Description is a number.
    // When the Resource is created, then it is refused.
    const error = await createKmsResource("Key", { Description: 42 });

    assertStringIncludes(error.message, "Description must be a string");
  });

  it("refuses a non-boolean Enabled", async () => {
    // Given a template whose Enabled is neither a boolean nor CloudFormation's
    // string form of one.
    // When the Resource is created, then it is refused.
    const error = await createKmsResource("Key", { Enabled: "maybe" });

    assertStringIncludes(error.message, "Enabled must be a boolean");
  });

  it("refuses an Alias with no AliasName", async () => {
    // Given a template declaring an alias that names nothing.
    // When the Resource is created, then it is refused.
    const error = await createKmsResource("Alias", {
      TargetKeyId: "some-key",
    });

    assertStringIncludes(
      error.message,
      "Invalid AWS::KMS::Alias BadKey: AliasName must be a string",
    );
  });

  it("refuses an Alias with no TargetKeyId", async () => {
    // Given a template declaring an alias that points at nothing.
    // When the Resource is created, then it is refused.
    const error = await createKmsResource("Alias", {
      AliasName: "alias/app-key",
    });

    assertStringIncludes(error.message, "TargetKeyId must be a string");
  });

  it("refuses an Alias name KMS itself would refuse", async () => {
    // Given a template declaring an alias in the prefix reserved for AWS
    // managed keys.
    // When the Resource is created, then CreateAlias refuses it, as it would
    // an SDK caller.
    const error = await createKmsResource("Alias", {
      AliasName: "alias/aws/app-key",
      TargetKeyId: "some-key",
    });

    assertStringIncludes(error.message, "is reserved for AWS managed keys");
  });

  it("refuses a KMS Resource type it does not create", async () => {
    // Given a template declaring a KMS grant, which is not simulated.
    // When the Resource is created, then it is reported as unsupported rather
    // than treated as deployed.
    const error = await createKmsResource("Grant", {});

    assertStringIncludes(
      error.message,
      "Unsupported sim KMS CloudFormation Resource Grant",
    );
  });

  it("refuses Fn::GetAtt on an Alias, which has no attributes", async () => {
    // Given a deployed alias.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: {
        Resources: {
          AppKey: { Type: "AWS::KMS::Key" },
          AppKeyAlias: {
            Type: "AWS::KMS::Alias",
            Properties: {
              AliasName: "alias/app-key",
              TargetKeyId: { Ref: "AppKey" },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // When an attribute is asked for.
    const error = assertThrowsError(() =>
      stack.getResource("AppKeyAlias")?.attributeValue("Arn"),
    );

    // Then it is refused, because real AWS::KMS::Alias has no Fn::GetAtt
    // attributes to answer with.
    assertStringIncludes(
      error.message,
      "AWS::KMS::Alias has no Fn::GetAtt attributes",
    );
  });

  it("refuses an unknown Key attribute", async () => {
    // Given a deployed key.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "app-stack",
      template: { Resources: { AppKey: { Type: "AWS::KMS::Key" } } },
    });
    await stack.waitForDeployComplete();

    // When an attribute the simulator does not model is asked for.
    const error = assertThrowsError(() =>
      stack.getResource("AppKey")?.attributeValue("KeyRotationStatus"),
    );

    // Then it is refused rather than answered with something wrong.
    assertStringIncludes(
      error.message,
      "Unsupported AWS::KMS::Key attribute KeyRotationStatus",
    );
  });
});
