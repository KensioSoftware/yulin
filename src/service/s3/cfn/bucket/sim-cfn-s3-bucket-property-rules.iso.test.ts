import { ListBucketsCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
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

/**
 * Deploy a Bucket carrying the given properties and wait for it to settle.
 */
async function deployBucket(
  simAws: SimAws,
  properties: SimCfnTemplateValueRecord,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
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
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * How many Buckets simulated S3 holds.
 */
async function bucketCount(simAws: SimAws): Promise<number> {
  const output = await simAws.s3().listBuckets(new ListBucketsCommand());

  return (output.Buckets ?? []).length;
}

describe("AWS::S3::Bucket property rules", () => {
  it("deploys a Bucket without a real property simulated S3 cannot act on", async () => {
    // Given a template asking for Bucket versioning.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await deployBucket(simAws, {
      VersioningConfiguration: { Status: "Enabled" },
    });

    // Then the Bucket is created, unversioned, and the property it was created
    // without is recorded against the Resource.
    assertIdentical(await bucketCount(simAws), 1);
    assertArrayLength(stack.ignoredProperties, 1);
    const ignored = stack.ignoredProperties[0];
    assertNonNullable(ignored);
    assertIdentical(ignored.logicalId, "Bucket");
    assertIdentical(ignored.resourceType, "AWS::S3::Bucket");
    assertIdentical(ignored.path, "VersioningConfiguration");
    assertStringIncludes(ignored.reason, "Object versions are not simulated");
  });

  it("deploys a Bucket without a name it has never heard of", async () => {
    // Given a template carrying a misspelled property.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await deployBucket(simAws, { BucketNam: "uploads" });

    // Then the Bucket is still created, and the name nothing read is recorded
    // rather than failing a stack over a typo or a property AWS added since.
    assertIdentical(await bucketCount(simAws), 1);
    assertArrayLength(stack.ignoredProperties, 1);
    const ignored = stack.ignoredProperties[0];
    assertNonNullable(ignored);
    assertIdentical(ignored.path, "BucketNam");
    assertStringIncludes(
      ignored.reason,
      "BucketNam is not a property simulated S3 knows about",
    );
  });

  it("records every unsimulated property, not only the first", async () => {
    // Given a template asking for object locking as well as versioning.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await deployBucket(simAws, {
      ObjectLockEnabled: true,
      VersioningConfiguration: { Status: "Enabled" },
    });

    // Then the Bucket exists and both omissions are reported.
    assertIdentical(await bucketCount(simAws), 1);
    assertArrayLength(stack.ignoredProperties, 2);
    assertIdentical(
      stack.ignoredProperties.map((entry) => entry.path).join(", "),
      "ObjectLockEnabled, VersioningConfiguration",
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

  it("deploys a Bucket carrying properties nothing simulated can tell apart", async () => {
    // Given a template with the encryption and tags CDK puts on almost every
    // Bucket it synthesizes.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await deployBucket(simAws, {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
        ],
      },
      Tags: [{ Key: "app", Value: "uploads" }],
    });

    // Then the Bucket is created, and nothing is reported: no simulated
    // command could tell either property was left out.
    assertIdentical(await bucketCount(simAws), 1);
    assertArrayLength(stack.ignoredProperties, 0);
  });

  it("accepts the four properties simulated S3 acts on", async () => {
    // Given a template using every AWS::S3::Bucket property this simulation
    // implements.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await deployBucket(simAws, {
      NotificationConfiguration: { LambdaConfigurations: [] },
      PublicAccessBlockConfiguration: { BlockPublicPolicy: false },
      WebsiteConfiguration: { IndexDocument: "index.html" },
    });

    // Then the Bucket is created with nothing left out.
    assertIdentical(await bucketCount(simAws), 1);
    assertArrayLength(stack.ignoredProperties, 0);
  });
});
