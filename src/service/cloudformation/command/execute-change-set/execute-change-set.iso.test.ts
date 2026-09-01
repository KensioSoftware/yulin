import { describe, it } from "vitest";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import {
  CreateChangeSetCommand,
  CreateStackCommand,
  DeleteChangeSetCommand,
  DescribeChangeSetCommand,
  DescribeStacksCommand,
  ExecuteChangeSetCommand,
  ListChangeSetsCommand,
} from "@aws-sdk/client-cloudformation";
import { GetParameterCommand } from "@aws-sdk/client-ssm";
import { SimAws } from "../../../aws/sim-aws.js";
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
};

/**
 * Deploy the Stack above, ready for a change set against it.
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

async function createChangeSet(
  simAws: SimAws,
  changeSetName: string,
  changed: CfnTemplateBodyRecord,
): Promise<void> {
  await simAws.cloudFormation().createChangeSet(
    new CreateChangeSetCommand({
      StackName: "reports-stack",
      ChangeSetName: changeSetName,
      TemplateBody: jsonStringify(changed),
    }),
  );
}

async function describeChangeSet(simAws: SimAws, changeSetName: string) {
  return await simAws.cloudFormation().describeChangeSet(
    new DescribeChangeSetCommand({
      StackName: "reports-stack",
      ChangeSetName: changeSetName,
    }),
  );
}

const withArchiveBucket = {
  Resources: {
    ...template.Resources,
    ArchiveBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "reports-archive" },
    },
  },
};

describe("CloudFormation ExecuteChangeSetCommand", () => {
  it("applies what the change set describes", async () => {
    // Given a deployed Stack with a change set adding a Bucket to it.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);
    await createChangeSet(simAws, "reports-change", withArchiveBucket);

    // When the change set is executed.
    await cloudFormation.executeChangeSet(
      new ExecuteChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-change",
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // Then the Bucket the change set described is in simulated S3, and the
    // Stack reports the update as complete.
    assertNonNullable(simAws.s3().getSimBucketByName("reports-archive"));

    const stacks = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "reports-stack" }),
    );
    assertArrayLength(stacks.Stacks, 1);
    assertIdentical(stacks.Stacks[0].StackStatus, "UPDATE_COMPLETE");

    // And the change set records that it was executed.
    await simAws.backgroundTasksComplete();

    const described = await describeChangeSet(simAws, "reports-change");
    assertIdentical(described.ExecutionStatus, "EXECUTE_COMPLETE");
  });

  it("creates the Stack a CREATE change set was made for", async () => {
    // Given a Stack in review, brought into being by a CREATE change set.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createChangeSet(
      new CreateChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-create",
        ChangeSetType: "CREATE",
        TemplateBody: jsonStringify(template),
      }),
    );

    // When the change set is executed.
    await cloudFormation.executeChangeSet(
      new ExecuteChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-create",
      }),
    );
    await cloudFormation.waitForStackDeployComplete("reports-stack");

    // Then the template's Resources are in simulated AWS.
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));

    const parameter = await simAws
      .ssm()
      .getParameter(new GetParameterCommand({ Name: "/app/reports-bucket" }));
    assertIdentical(parameter.Parameter?.Value, "reports");
  });

  it("refuses a change set that has already been executed", async () => {
    // Given an executed change set.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);
    await createChangeSet(simAws, "reports-change", withArchiveBucket);
    await cloudFormation.executeChangeSet(
      new ExecuteChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-change",
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // When it is executed again.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.executeChangeSet(
        new ExecuteChangeSetCommand({
          StackName: "reports-stack",
          ChangeSetName: "reports-change",
        }),
      ),
    );

    // Then it is refused for the status it is in.
    assertIdentical(error.name, "InvalidChangeSetStatusException");
    assertStringIncludes(error.message, "cannot be executed");
  });

  it("gives up on the other change sets against the Stack", async () => {
    // Given a Stack holding two change sets.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);
    await createChangeSet(simAws, "reports-change", withArchiveBucket);
    await createChangeSet(simAws, "reports-other", {
      Resources: { ReportsBucket: reportsBucket },
    });

    // When one of them is executed.
    await cloudFormation.executeChangeSet(
      new ExecuteChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-change",
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // Then the other one is obsolete, because it was worked out against a
    // Stack this execution has moved on.
    const other = await describeChangeSet(simAws, "reports-other");
    assertIdentical(other.ExecutionStatus, "OBSOLETE");

    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.executeChangeSet(
        new ExecuteChangeSetCommand({
          StackName: "reports-stack",
          ChangeSetName: "reports-other",
        }),
      ),
    );
    assertIdentical(error.name, "InvalidChangeSetStatusException");
  });

  it("takes a change set away without executing it", async () => {
    // Given a Stack holding a change set.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);
    await createChangeSet(simAws, "reports-change", withArchiveBucket);

    // When the change set is deleted.
    await cloudFormation.deleteChangeSet(
      new DeleteChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-change",
      }),
    );

    // Then the Stack holds none, and nothing the change set described happened.
    const listed = await cloudFormation.listChangeSets(
      new ListChangeSetsCommand({ StackName: "reports-stack" }),
    );
    assertArrayEmpty(listed.Summaries);
    assertUndefined(simAws.s3().getSimBucketByName("reports-archive"));

    // And describing it is refused, as CloudFormation refuses it.
    const error = await assertThrowsErrorAsync(async () =>
      describeChangeSet(simAws, "reports-change"),
    );
    assertIdentical(error.name, "ValidationError");
  });

  it("lists the change sets a Stack holds", async () => {
    // Given a Stack holding two change sets.
    const simAws = new SimAws();

    await deployReportsStack(simAws);
    await createChangeSet(simAws, "reports-change", withArchiveBucket);
    await createChangeSet(simAws, "reports-other", {
      Resources: { ReportsBucket: reportsBucket },
    });

    // When the Stack's change sets are listed.
    const listed = await simAws
      .cloudFormation()
      .listChangeSets(
        new ListChangeSetsCommand({ StackName: "reports-stack" }),
      );

    // Then both are there, in the order they were created.
    assertArrayLength(listed.Summaries, 2);
    assertIdentical(listed.Summaries[0].ChangeSetName, "reports-change");
    assertIdentical(listed.Summaries[1].ChangeSetName, "reports-other");
    assertIdentical(listed.Summaries[0].ExecutionStatus, "AVAILABLE");
  });
});
