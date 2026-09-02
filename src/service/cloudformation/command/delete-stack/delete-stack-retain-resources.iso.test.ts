import { buffer } from "node:stream/consumers";
import { describe, it } from "vitest";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import {
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "../../../aws/sim-aws.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";

const template = {
  Resources: {
    ReportsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "reports" },
    },
    ArchiveBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "archive" },
    },
  },
};

describe("CloudFormation DeleteStackCommand RetainResources", () => {
  /** Deploy the two-Bucket Stack above and put an Object in the first. */
  async function deployReportsStack(simAws: SimAws): Promise<string> {
    const cloudFormation = simAws.cloudFormation();
    const creation = await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(template),
      }),
    );

    await cloudFormation.waitForStackDeployComplete("reports-stack");
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "reports",
        Key: "january.csv",
        Body: "reported",
      }),
    );

    return creation.StackId ?? "";
  }

  it("leaves a named Resource and what it holds in simulated AWS", async () => {
    // Given a deployed Stack of two Buckets, one of them holding an Object.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    const stackId = await deployReportsStack(simAws);
    const stack = cloudFormation.getStackByName("reports-stack");

    assertNonNullable(stack);

    // When the Stack is deleted, keeping the Bucket that holds the Object.
    await cloudFormation.deleteStack(
      new DeleteStackCommand({
        StackName: "reports-stack",
        RetainResources: ["ReportsBucket"],
      }),
    );
    await stack.waitForDeleteComplete();

    // Then the kept Bucket is still in simulated S3 with what it held, which
    // is also why S3 did not refuse the Stack a Bucket with an Object in it.
    const kept = await simAws
      .s3()
      .getObject(
        new GetObjectCommand({ Bucket: "reports", Key: "january.csv" }),
      );
    assertNonNullable(kept.Body);

    const keptBytes = await buffer(kept.Body);

    assertIdentical(keptBytes.toString(), "reported");

    // And the Bucket the call did not name has gone.
    assertUndefined(simAws.s3().getSimBucketByName("archive"));

    // And the kept Bucket is reported the way a retained Resource is.
    assertIdentical(
      stack.getResource("ReportsBucket")?.status,
      "DELETE_SKIPPED",
    );
    assertArrayLength(stack.retainedResources, 1);

    // And the Stack itself finished deleting around it, so its name is free
    // and its Stack ID still describes it.
    assertUndefined(cloudFormation.getStackByName("reports-stack"));

    const described = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: stackId }),
    );

    assertIdentical(described.Stacks?.[0]?.StackStatus, "DELETE_COMPLETE");
  });

  it("refuses a logical ID the Stack has no Resource for", async () => {
    // Given a deployed Stack that has no Resource called ReportBucket, which
    // is the sort of thing a caller writes meaning ReportsBucket.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);

    // When the Stack is deleted keeping that name.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.deleteStack(
        new DeleteStackCommand({
          StackName: "reports-stack",
          RetainResources: ["ReportBucket"],
        }),
      ),
    );

    // Then the call is refused rather than deleting the Bucket it was meant
    // to keep, and the message says which name found nothing.
    assertInstanceOf(error, SimCloudFormationValidationError);
    assertStringIncludes(error.message, "ReportBucket");

    // And the Stack is still deployed, with both Buckets where they were.
    await simAws.backgroundTasksComplete();

    assertNonNullable(cloudFormation.getStackByName("reports-stack"));
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));
    assertNonNullable(simAws.s3().getSimBucketByName("archive"));
  });

  it("keeps a Resource named by its CDK construct ID", async () => {
    // Given a Stack whose logical IDs carry the hash CDK synthesizes onto the
    // construct ID, which is not what a test written against the CDK app has.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "site-stack",
        TemplateBody: jsonStringify({
          Resources: {
            SiteBucket43A2B1C9: {
              Type: "AWS::S3::Bucket",
              Metadata: { "aws:cdk:path": "SiteStack/SiteBucket/Resource" },
              Properties: { BucketName: "site" },
            },
          },
        }),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("site-stack");

    const stack = cloudFormation.getStackByName("site-stack");
    assertNonNullable(stack);

    // When the Stack is deleted keeping the Bucket by its construct ID.
    await cloudFormation.deleteStack(
      new DeleteStackCommand({
        StackName: "site-stack",
        RetainResources: ["SiteBucket"],
      }),
    );
    await stack.waitForDeleteComplete();

    // Then the Bucket the construct ID resolved to was kept.
    assertNonNullable(simAws.s3().getSimBucketByName("site"));
    assertArrayLength(stack.retainedResources, 1);
  });
});
