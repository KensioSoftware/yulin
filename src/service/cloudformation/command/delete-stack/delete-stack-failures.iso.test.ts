import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import {
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "../../../aws/sim-aws.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import { SimCloudFormationAlreadyExistsException } from "../../error/sim-cloudformation.error.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

const template = {
  Resources: {
    ReportsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "reports" },
    },
  },
};

/**
 * Deploy the Stack above and put an object in its Bucket, so S3 refuses to
 * delete the Bucket the way it does in AWS.
 */
async function deployStackWithFullBucket(simAws: SimAws): Promise<void> {
  const cloudFormation = simAws.cloudFormation();

  await cloudFormation.createStack(
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
}

describe("CloudFormation DeleteStackCommand failures", () => {
  it("fails the Stack deletion when a Resource cannot be deleted", async () => {
    // Given a deployed Stack whose Bucket still holds an Object, which real
    // CloudFormation refuses to delete rather than emptying first.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployStackWithFullBucket(simAws);

    // When the Stack is deleted and the teardown runs.
    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "reports-stack" }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.waitForStackDeleteComplete("reports-stack"),
    );

    // Then the failure says which Resource stopped it.
    assertStringIncludes(error.message, "ReportsBucket");
    assertStringIncludes(error.message, "holds 1 Objects");

    // And the Stack is still there in DELETE_FAILED, with the reason on it,
    // rather than quietly reporting a deletion that did not happen.
    const describeOutput = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "reports-stack" }),
    );
    const [describedStack] = describeOutput.Stacks ?? [];

    assertNonNullable(describedStack);
    assertIdentical(describedStack.StackStatus, "DELETE_FAILED");
    assertStringIncludes(
      describedStack.StackStatusReason ?? "",
      "ReportsBucket",
    );

    // And the Bucket is still in simulated S3 with its Object.
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));
  });

  it("keeps the Stack name in use after a failed deletion", async () => {
    // Given a Stack whose deletion failed.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployStackWithFullBucket(simAws);
    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "reports-stack" }),
    );
    await simAws.backgroundTasksComplete();

    // When the same Stack name is created again, then it is refused: the name
    // is only released by a deletion that finished.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.createStack(
        new CreateStackCommand({
          StackName: "reports-stack",
          TemplateBody: jsonStringify(template),
        }),
      ),
    );

    assertInstanceOf(error, SimCloudFormationAlreadyExistsException);
  });

  it("deletes a Stack asked for again once the Resource can go", async () => {
    // Given a Stack left in DELETE_FAILED by a Bucket that was not empty.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployStackWithFullBucket(simAws);
    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "reports-stack" }),
    );
    await simAws.backgroundTasksComplete();

    // When the Object is removed and the Stack is deleted again.
    const bucket = simAws.s3().getSimBucketByName("reports");
    assertNonNullable(bucket);
    await bucket.deleteObject("january.csv");

    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "reports-stack" }),
    );
    await cloudFormation.waitForStackDeleteComplete("reports-stack");

    // Then the Stack deletes, because a failed deletion can be retried.
    assertUndefined(
      simAws.s3().getSimBucketByName("reports"),
      "Bucket after retried Stack deletion",
    );
    assertUndefined(
      cloudFormation.getStackByName("reports-stack"),
      "Stack after retried Stack deletion",
    );
  });

  it("does not report a deployment failure as the delete reason", async () => {
    // Given a Stack left in CREATE_FAILED by a Bucket name S3 refused.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "invalid-stack",
        TemplateBody: jsonStringify({
          Resources: {
            InvalidBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "Invalid_Bucket_Name" },
            },
          },
        }),
      }),
    );
    await assertThrowsErrorAsync(async () =>
      cloudFormation.waitForStackDeployComplete("invalid-stack"),
    );

    // When the Stack is deleted.
    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "invalid-stack" }),
    );

    // Then the reason reported beside the delete status is the deletion's own,
    // rather than the deployment failure the Stack was left with.
    const describeOutput = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "invalid-stack" }),
    );
    const [describedStack] = describeOutput.Stacks ?? [];

    assertNonNullable(describedStack);
    assertIdentical(describedStack.StackStatus, "DELETE_IN_PROGRESS");
    assertUndefined(describedStack.StackStatusReason);
  });

  it("requires a StackName", async () => {
    // Given a DeleteStackCommand input without the required StackName.
    const simAws = new SimAws();

    // When DeleteStackCommand is handled without StackName, then it rejects.
    await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deleteStack(
        // @ts-expect-error -- testing missing StackName
        new DeleteStackCommand({}),
      ),
    );
  });

  it("refuses a caller without cloudformation:DeleteStack", async () => {
    // Given a deployed Stack and a caller whose Role allows nothing.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(template),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");

    // When that caller sends DeleteStackCommand, then it is denied.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.deleteStack(
        new DeleteStackCommand({ StackName: "reports-stack" }),
        {
          caller: {
            kind: "arn",
            arn: `arn:aws:iam::${simAws.defaultAccountId}:role/NoPermsRole`,
          },
        },
      ),
    );

    assertInstanceOf(error, SimIamAccessDenied);

    // And the Stack and its Bucket are untouched.
    assertNonNullable(cloudFormation.getStackByName("reports-stack"));
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));
  });
});
