import { describe, it } from "vitest";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import {
  CreateStackCommand,
  DescribeStacksCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { GetParameterCommand } from "@aws-sdk/client-ssm";
import { SimAws } from "../../../aws/sim-aws.js";
import { simS3BodyToBuffer } from "../../../s3/storage/s3-body-buffer.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import type { CfnTemplateBodyRecord } from "../../template/sim-cfn-template.js";

const reportsBucket = {
  Type: "AWS::S3::Bucket",
  Properties: { BucketName: "reports" },
};

const bucketNameParameter = {
  Type: "AWS::SSM::Parameter",
  Properties: {
    Name: "/app/reports-bucket",
    Type: "String",
    Value: { Ref: "ReportsBucket" },
  },
};

const template = {
  Resources: {
    ReportsBucket: reportsBucket,
    BucketNameParameter: bucketNameParameter,
  },
  Outputs: { BucketName: { Value: { Ref: "ReportsBucket" } } },
};

/**
 * Deploy the Stack above, ready for an update to change it.
 */
async function deployReportsStack(simAws: SimAws): Promise<void> {
  const cloudFormation = simAws.cloudFormation();

  await cloudFormation.createStack(
    new CreateStackCommand({
      StackName: "reports-stack",
      TemplateBody: jsonStringify(template),
    }),
  );
  await cloudFormation.waitForStackDeployComplete("reports-stack");
}

async function updateReportsStack(
  simAws: SimAws,
  updatedTemplate: CfnTemplateBodyRecord,
): Promise<void> {
  const cloudFormation = simAws.cloudFormation();

  await cloudFormation.updateStack(
    new UpdateStackCommand({
      StackName: "reports-stack",
      TemplateBody: jsonStringify(updatedTemplate),
    }),
  );
  await cloudFormation.waitForStackUpdateComplete("reports-stack");
}

describe("CloudFormation UpdateStackCommand", () => {
  it("creates a Resource the new template adds", async () => {
    // Given a deployed Stack whose Bucket holds a report.
    const simAws = new SimAws();

    await deployReportsStack(simAws);
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "reports",
        Key: "january.csv",
        Body: "reported",
      }),
    );

    // When UpdateStackCommand adds a second Bucket to the template.
    await updateReportsStack(simAws, {
      ...template,
      Resources: {
        ...template.Resources,
        ArchiveBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "reports-archive" },
        },
      },
    });

    // Then the added Bucket is in simulated S3, and the Bucket the template
    // did not change still holds its report, which is the point of updating a
    // Stack rather than deploying it again.
    assertNonNullable(simAws.s3().getSimBucketByName("reports-archive"));

    const report = await simAws
      .s3()
      .getObject(
        new GetObjectCommand({ Bucket: "reports", Key: "january.csv" }),
      );
    assertNonNullable(report.Body);

    const reportBody = await simS3BodyToBuffer(report.Body);
    assertIdentical(reportBody.toString(), "reported");
  });

  it("deletes a Resource the new template drops", async () => {
    // Given a deployed Stack with a Parameter in it.
    const simAws = new SimAws();

    await deployReportsStack(simAws);

    // When UpdateStackCommand is sent a template without that Parameter.
    await updateReportsStack(simAws, {
      Resources: { ReportsBucket: reportsBucket },
    });

    // Then Parameter Store no longer holds it, and the Bucket is untouched.
    await assertThrowsErrorAsync(async () =>
      simAws
        .ssm()
        .getParameter(new GetParameterCommand({ Name: "/app/reports-bucket" })),
    );
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));

    const stack = simAws.cloudFormation().getStackByName("reports-stack");
    assertUndefined(stack?.getResource("BucketNameParameter"));
  });

  it("replaces a changed Resource and everything naming it", async () => {
    // Given a deployed Stack whose Parameter holds a Ref to its Bucket.
    const simAws = new SimAws();

    await deployReportsStack(simAws);

    // When UpdateStackCommand changes the Bucket's name.
    await updateReportsStack(simAws, {
      ...template,
      Resources: {
        ...template.Resources,
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "reports-v2" },
        },
      },
    });

    // Then the Bucket was replaced rather than renamed, so what it held has
    // gone with it.
    assertNonNullable(simAws.s3().getSimBucketByName("reports-v2"));
    assertUndefined(simAws.s3().getSimBucketByName("reports"));

    // And the Parameter naming the Bucket was replaced too, so it reads as the
    // Bucket that is there now rather than the one that has gone.
    const parameter = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/app/reports-bucket" }));
    assertIdentical(parameter.Parameter?.Value, "reports-v2");
  });

  it("reports the update statuses through DescribeStacks", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);

    // When UpdateStackCommand is handled, the update has only started.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify({
          Resources: { ReportsBucket: reportsBucket },
        }),
      }),
    );

    const inProgress = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "reports-stack" }),
    );

    assertArrayLength(inProgress.Stacks, 1);
    assertIdentical(inProgress.Stacks[0].StackStatus, "UPDATE_IN_PROGRESS");

    // And once the Resource work finishes, the Stack is UPDATE_COMPLETE.
    await simAws.backgroundTasksComplete();

    const complete = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "reports-stack" }),
    );

    assertIdentical(complete.Stacks?.[0]?.StackStatus, "UPDATE_COMPLETE");
  });

  it("reports the new template body and re-resolved Outputs", async () => {
    // Given a deployed Stack with an Output naming its Bucket.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);

    // When UpdateStackCommand replaces the Bucket.
    const updatedTemplate = {
      ...template,
      Resources: {
        ...template.Resources,
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "reports-v2" },
        },
      },
    };
    await updateReportsStack(simAws, updatedTemplate);

    // Then the Stack holds the new template body.
    const stack = cloudFormation.getStackByName("reports-stack");
    assertNonNullable(stack);
    assertIdentical(
      jsonStringify(stack.template),
      jsonStringify(updatedTemplate),
    );

    // And the Output was resolved again against it.
    const describeOutput = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "reports-stack" }),
    );
    const [describedStack] = describeOutput.Stacks ?? [];

    assertIdentical(describedStack?.Outputs?.[0]?.OutputValue, "reports-v2");
  });

  it("updates a Stack whose template only changes an Output", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);

    // When UpdateStackCommand changes nothing but an Output.
    await updateReportsStack(simAws, {
      ...template,
      Outputs: {
        BucketName: {
          Value: { Ref: "ReportsBucket" },
          Description: "Where the reports go",
        },
      },
    });

    // Then the Stack updated rather than refusing an update with nothing to do,
    // and the Bucket was left alone.
    const describeOutput = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "reports-stack" }),
    );
    const [describedStack] = describeOutput.Stacks ?? [];

    assertIdentical(describedStack?.StackStatus, "UPDATE_COMPLETE");
    assertIdentical(
      describedStack.Outputs?.[0]?.Description,
      "Where the reports go",
    );
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));
  });
});
