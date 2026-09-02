import {
  GetBucketEncryptionCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../../../../util/type-guard/defined.js";
import type { CfnTemplateBodyRecord } from "../../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimAws } from "../../../../aws/sim-aws.js";

/**
 * A template declaring one Bucket with the given encryption property.
 */
function bucketTemplate(
  encryption: SimCfnTemplateValue,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      DocumentBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "documents",
          BucketEncryption: encryption,
        },
      },
    },
  };
}

/**
 * The BucketEncryption property of an AWS::S3::Bucket Resource.
 */
describe("S3 CloudFormation Bucket encryption", () => {
  it("applies the default encryption a template declares", async () => {
    // Given a template declaring KMS encryption on its Bucket.
    const simAws = new SimAws();

    // When the template is deployed.
    await simAws.cloudFormation().deployTemplate({
      stackName: "documents",
      template: bucketTemplate({
        ServerSideEncryptionConfiguration: [
          {
            BucketKeyEnabled: true,
            ServerSideEncryptionByDefault: { SSEAlgorithm: "aws:kms" },
          },
        ],
      }),
    });

    // Then the Bucket reports it, and stamps it on what is written there.
    // CloudFormation states the rule under a name of its own, which is what
    // the Resource translates for the request.
    const simS3 = simAws.s3();
    const configured = await simS3.getBucketEncryption(
      new GetBucketEncryptionCommand({ Bucket: "documents" }),
    );

    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "documents",
        Key: "contracts/one.pdf",
        Body: "one",
      }),
    );
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "documents", Key: "contracts/one.pdf" }),
    );

    const rule = configured.ServerSideEncryptionConfiguration?.Rules?.[0];

    assertDefined(rule, "the encryption rule");
    assertIdentical(
      rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm,
      "aws:kms",
    );
    assertTrue(rule.BucketKeyEnabled);
    assertIdentical(read.ServerSideEncryption, "aws:kms");
  });

  it("fails the Resource for an algorithm S3 does not apply", async () => {
    // Given a template naming something that is not an algorithm.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "documents",
        template: bucketTemplate({
          ServerSideEncryptionConfiguration: [
            { ServerSideEncryptionByDefault: { SSEAlgorithm: "ROT13" } },
          ],
        }),
      }),
    );

    // Then the Stack fails in the words an SDK caller is refused in.
    assertStringIncludes(error.message, "ROT13");
  });
});
