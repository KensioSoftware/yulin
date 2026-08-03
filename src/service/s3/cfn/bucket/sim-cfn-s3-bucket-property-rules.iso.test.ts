import { ListBucketsCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Deploy a Bucket carrying the given properties, expecting the Stack to fail,
 * and return the error the deployment gave.
 */
async function deployFailing(
  simAws: SimAws,
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: {
        Resources: {
          Bucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "uploads", ...properties },
          },
        },
      },
    });
  });
}

describe("AWS::S3::Bucket property rules", () => {
  it("refuses a real Bucket property simulated S3 does not simulate", async () => {
    // Given a template asking for Bucket versioning.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      VersioningConfiguration: { Status: "Enabled" },
    });

    // Then the Stack fails naming the property, rather than deploying a Bucket
    // that looks versioned to the template and is not.
    assertStringIncludes(
      error.message,
      "Invalid AWS::S3::Bucket Resource Bucket: VersioningConfiguration is a " +
        "real AWS::S3::Bucket property that simulated S3 does not simulate",
    );
  });

  it("refuses a name that is not a Bucket property at all", async () => {
    // Given a template carrying a misspelled property.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, { BucketNam: "uploads" });

    // Then the Stack fails naming it.
    assertStringIncludes(
      error.message,
      "Invalid AWS::S3::Bucket Resource Bucket: BucketNam is not an " +
        "AWS::S3::Bucket property",
    );
  });

  it("refuses the property before creating the Bucket", async () => {
    // Given a template asking for object locking alongside a valid Bucket name.
    const simAws = new SimAws();

    // When the template is deployed.
    await deployFailing(simAws, { ObjectLockEnabled: true });

    // Then no Bucket is left behind for a later deployment to collide with.
    const output = await simAws.s3().listBuckets(new ListBucketsCommand());

    assertArrayLength(output.Buckets ?? [], 0);
  });

  it("deploys a Bucket carrying properties nothing simulated can tell apart", async () => {
    // Given a template with the encryption and tags CDK puts on almost every
    // Bucket it synthesizes.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: {
        Resources: {
          Bucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "uploads",
              BucketEncryption: {
                ServerSideEncryptionConfiguration: [
                  {
                    ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" },
                  },
                ],
              },
              Tags: [{ Key: "app", Value: "uploads" }],
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the Bucket is created, and the properties are read and ignored.
    const output = await simAws.s3().listBuckets(new ListBucketsCommand());

    assertArrayLength(output.Buckets ?? [], 1);
  });

  it("accepts the four properties simulated S3 acts on", async () => {
    // Given a template using every AWS::S3::Bucket property this simulation
    // implements.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: {
        Resources: {
          Bucket: {
            Type: "AWS::S3::Bucket",
            Properties: {
              BucketName: "uploads",
              NotificationConfiguration: { LambdaConfigurations: [] },
              PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
              WebsiteConfiguration: { IndexDocument: "index.html" },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the Bucket is created.
    const output = await simAws.s3().listBuckets(new ListBucketsCommand());

    assertArrayLength(output.Buckets ?? [], 1);
  });
});
