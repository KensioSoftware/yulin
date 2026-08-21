import { describe, it } from "vitest";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import {
  CreateStackCommand,
  DeleteStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { GetRoleCommand } from "@aws-sdk/client-iam";
import { SimAws } from "../../../aws/sim-aws.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

const template = {
  Resources: {
    ReportsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "reports" },
    },
    ReporterRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "reporter-role",
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
      },
    },
    ReporterFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "reporter",
        Role: { "Fn::GetAtt": ["ReporterRole", "Arn"] },
        Code: { ZipFile: "exports.handler = async () => 'reported';" },
        Handler: "index.handler",
        Runtime: "nodejs22.x",
      },
    },
  },
};

describe("CloudFormation DeleteStackCommand", () => {
  it("deletes the Resources the Stack created", async () => {
    // Given a deployed Stack holding Resources in three services.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(template),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");

    assertNonNullable(simAws.s3().getSimBucketByName("reports"));

    // When DeleteStackCommand is handled and the deletion finishes.
    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "reports-stack" }),
    );
    await cloudFormation.waitForStackDeleteComplete("reports-stack");

    // Then every Resource has gone from the service that made it.
    assertUndefined(simAws.s3().getSimBucketByName("reports"));
    assertUndefined(simAws.lambda().getSimFunctionByName("reporter"));
    await assertThrowsErrorAsync(async () =>
      simAws.iam().getRole(new GetRoleCommand({ RoleName: "reporter-role" })),
    );
  });

  it("reports the delete statuses through DescribeStacks", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(template),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");

    // When DeleteStackCommand is handled, deletion has only started.
    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "reports-stack" }),
    );

    const describeOutput = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "reports-stack" }),
    );

    // Then the Stack reports DELETE_IN_PROGRESS.
    assertArrayLength(describeOutput.Stacks, 1);
    assertIdentical(describeOutput.Stacks[0].StackStatus, "DELETE_IN_PROGRESS");

    // And once the deletion completes, the Stack name is answered the way
    // CloudFormation answers a name it no longer has.
    await simAws.backgroundTasksComplete();

    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.describeStacks(
        new DescribeStacksCommand({ StackName: "reports-stack" }),
      ),
    );

    assertInstanceOf(error, SimCloudFormationValidationError);
    assertIdentical(
      error.message,
      "Stack with id reports-stack does not exist",
    );
  });

  it("frees the Stack name for a Stack deployed again", async () => {
    // Given a Stack that has been deployed and then deleted.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(template),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");
    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "reports-stack" }),
    );
    await cloudFormation.waitForStackDeleteComplete("reports-stack");

    // When the same Stack name is created again.
    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(template),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");

    // Then it deploys, rather than being refused as a name already in use.
    const describeOutput = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "reports-stack" }),
    );

    assertIdentical(describeOutput.Stacks?.[0]?.StackStatus, "CREATE_COMPLETE");
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));
  });

  it("accepts a Stack name that is not there", async () => {
    // Given a CloudFormation service with no Stack of that name.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    // When DeleteStackCommand names it, then it succeeds rather than failing,
    // as CloudFormation does for a Stack that has already gone.
    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "never-existed" }),
    );

    assertUndefined(cloudFormation.getStackByName("never-existed"));
  });

  it("asks for the same Stack twice without deleting it twice", async () => {
    // Given a deployed Stack that is already deleting.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify({
          Resources: {
            ReportsBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "reports" },
            },
          },
        }),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");

    const stackRemoval = new DeleteStackCommand({
      StackName: "reports-stack",
    });

    // When DeleteStackCommand is handled twice.
    await cloudFormation.deleteStack(stackRemoval);
    await cloudFormation.deleteStack(stackRemoval);
    await simAws.backgroundTasksComplete();

    // Then the Stack has gone, and the second request did not ask S3 to delete
    // a Bucket that was already on its way out.
    assertUndefined(cloudFormation.getStackByName("reports-stack"));
    assertUndefined(simAws.s3().getSimBucketByName("reports"));
  });

  it("leaves a Resource whose DeletionPolicy retains it", async () => {
    // Given a deployed Stack whose Bucket is declared with DeletionPolicy
    // Retain, as CDK output often is.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "kept-stack",
        TemplateBody: jsonStringify({
          Resources: {
            KeptBucket: {
              Type: "AWS::S3::Bucket",
              DeletionPolicy: "Retain",
              Properties: { BucketName: "kept" },
            },
            GoneBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "gone" },
            },
          },
        }),
      }),
    );
    await cloudFormation.waitForStackDeployComplete("kept-stack");

    const stack = cloudFormation.getStackByName("kept-stack");
    assertNonNullable(stack);

    // When the Stack is deleted.
    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "kept-stack" }),
    );
    await stack.waitForDeleteComplete();

    // Then the retained Bucket is still in simulated S3, reported the way
    // CloudFormation reports one it stepped over, and the other has gone.
    assertNonNullable(simAws.s3().getSimBucketByName("kept"));
    assertUndefined(simAws.s3().getSimBucketByName("gone"));
    assertIdentical(stack.getResource("KeptBucket")?.status, "DELETE_SKIPPED");
    assertArrayLength(stack.retainedResources, 1);

    // And the Stack itself is still gone, so its name is free again.
    assertUndefined(cloudFormation.getStackByName("kept-stack"));
  });
});
