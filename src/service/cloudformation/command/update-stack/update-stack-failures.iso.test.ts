import { describe, it } from "vitest";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import {
  CreateStackCommand,
  DescribeStacksCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "../../../aws/sim-aws.js";
import { jsonStringify } from "../../../../util/type-guard/json.js";
import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

const template = {
  Resources: {
    ReportsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "reports" },
    },
  },
};

const renamedBucketTemplate = {
  Resources: {
    ReportsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "reports-v2" },
    },
  },
};

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

describe("CloudFormation UpdateStackCommand failures", () => {
  it("refuses an update with nothing to do", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);

    // When UpdateStackCommand is sent the template it was deployed from.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.updateStack(
        new UpdateStackCommand({
          StackName: "reports-stack",
          TemplateBody: jsonStringify(template),
        }),
      ),
    );

    // Then it is refused the way CloudFormation refuses it.
    assertInstanceOf(error, SimCloudFormationValidationError);
    assertIdentical(error.message, "No updates are to be performed.");

    // And the Stack is left where it was, rather than reporting an update.
    assertIdentical(
      cloudFormation.getStackByName("reports-stack")?.status,
      "CREATE_COMPLETE",
    );
  });

  it("refuses a Stack name the service does not hold", async () => {
    // Given a CloudFormation service with no Stack of that name.
    const simAws = new SimAws();

    // When UpdateStackCommand names it, then it is refused the way
    // DescribeStacks refuses it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().updateStack(
        new UpdateStackCommand({
          StackName: "never-existed",
          TemplateBody: jsonStringify(template),
        }),
      ),
    );

    assertInstanceOf(error, SimCloudFormationValidationError);
    assertIdentical(
      error.message,
      "Stack with id never-existed does not exist",
    );
  });

  it("fails the update when a Resource cannot be deleted", async () => {
    // Given a deployed Stack whose Bucket holds an Object, which S3 refuses to
    // delete, and a template that would replace that Bucket.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "reports",
        Key: "january.csv",
        Body: "reported",
      }),
    );

    // When the update runs.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(renamedBucketTemplate),
      }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.waitForStackUpdateComplete("reports-stack"),
    );

    // Then the failure says which Resource stopped it.
    assertStringIncludes(error.message, "ReportsBucket");
    assertStringIncludes(error.message, "holds 1 Objects");

    // And the Stack is rolled back onto the template it was deployed from,
    // with the reason the update stopped still on it.
    const describeOutput = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "reports-stack" }),
    );
    const [describedStack] = describeOutput.Stacks ?? [];

    assertNonNullable(describedStack);
    assertIdentical(describedStack.StackStatus, "UPDATE_ROLLBACK_COMPLETE");
    assertStringIncludes(
      describedStack.StackStatusReason ?? "",
      "ReportsBucket",
    );

    // And the Bucket is still in simulated S3 with its Object.
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));
  });

  it("refuses a second update while one is running", async () => {
    // Given a deployed Stack with an update already under way.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify(renamedBucketTemplate),
      }),
    );

    // When another update is asked for before that one has finished, then it
    // is refused: the difference to apply would be read from a Stack half way
    // through the first update.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.updateStack(
        new UpdateStackCommand({
          StackName: "reports-stack",
          TemplateBody: jsonStringify(template),
        }),
      ),
    );

    assertInstanceOf(error, SimCloudFormationValidationError);
    assertStringIncludes(error.message, "UPDATE_IN_PROGRESS");

    // And the first update still finishes.
    await cloudFormation.waitForStackUpdateComplete("reports-stack");
    assertNonNullable(simAws.s3().getSimBucketByName("reports-v2"));
  });

  it("requires a StackName", async () => {
    // Given an UpdateStackCommand input without the required StackName.
    const simAws = new SimAws();

    // When UpdateStackCommand is handled without StackName, then it rejects
    // saying which input it wanted.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().updateStack(
        // @ts-expect-error -- testing missing StackName
        new UpdateStackCommand({ TemplateBody: jsonStringify(template) }),
      ),
    );

    assertIdentical(error.message, "UpdateStackCommand.input.StackName");
  });

  it("requires a TemplateBody", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();

    await deployReportsStack(simAws);

    // When UpdateStackCommand is handled without TemplateBody and without
    // UsePreviousTemplate, then it rejects: nothing says what to apply.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .cloudFormation()
        .updateStack(new UpdateStackCommand({ StackName: "reports-stack" })),
    );

    assertIdentical(error.message, "UpdateStackCommand.input.TemplateBody");
  });

  it("refuses a caller without cloudformation:UpdateStack", async () => {
    // Given a deployed Stack and a caller whose Role allows nothing.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);

    // When that caller sends UpdateStackCommand, then it is denied.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.updateStack(
        new UpdateStackCommand({
          StackName: "reports-stack",
          TemplateBody: jsonStringify(renamedBucketTemplate),
        }),
        {
          caller: {
            kind: "arn",
            arn: `arn:aws:iam::${simAws.defaultAccountId}:role/NoPermsRole`,
          },
        },
      ),
    );

    assertInstanceOf(error, SimIamAccessDenied);

    // And the Stack's Bucket is untouched.
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));
  });
});
