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

  it("refuses a BucketName that is not a name", async () => {
    // Given a template whose BucketName is a number rather than a string.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, { BucketName: 42 });

    // Then the Stack fails, rather than deploying a Bucket named after the
    // logical id that nothing else in the template refers to.
    assertStringIncludes(
      error.message,
      "Invalid AWS::S3::Bucket Resource Bucket: BucketName must be a Bucket " +
        "name string",
    );
  });

  it("refuses a WebsiteConfiguration that is not the shape it should be", async () => {
    // Given a template stating the website configuration as a string.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      WebsiteConfiguration: "index.html",
    });

    // Then the Stack fails, rather than deploying a Bucket that serves no
    // website.
    assertStringIncludes(
      error.message,
      "Invalid AWS::S3::Bucket Resource Bucket: WebsiteConfiguration must be " +
        "an object",
    );
  });

  it("refuses RoutingRules that are not a list", async () => {
    // Given a template stating one routing rule rather than a list of them.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      WebsiteConfiguration: {
        IndexDocument: "index.html",
        RoutingRules: { RedirectRule: { HostName: "example.test" } },
      },
    });

    // Then the Stack fails naming the level that was wrong.
    assertStringIncludes(
      error.message,
      "WebsiteConfiguration RoutingRules must be a list",
    );
  });

  it("refuses a PublicAccessBlockConfiguration that is not the shape it should be", async () => {
    // Given a template stating the block settings as a boolean.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      PublicAccessBlockConfiguration: false,
    });

    // Then the Stack fails, rather than leaving the Bucket fully blocked and
    // refusing the public policy the template goes on to attach.
    assertStringIncludes(
      error.message,
      "PublicAccessBlockConfiguration must be an object",
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
