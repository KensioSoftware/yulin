import { describe, it } from "vitest";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import {
  CreateChangeSetCommand,
  CreateStackCommand,
  DescribeChangeSetCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
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
 * Deploy the Stack above, ready for a change set to be worked out against it.
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

/**
 * Create a change set against the deployed Stack and describe what it holds.
 */
async function describeChangeSetFor(
  simAws: SimAws,
  changed: CfnTemplateBodyRecord,
  changeSetName = "reports-change",
) {
  const cloudFormation = simAws.cloudFormation();

  await cloudFormation.createChangeSet(
    new CreateChangeSetCommand({
      StackName: "reports-stack",
      ChangeSetName: changeSetName,
      TemplateBody: jsonStringify(changed),
    }),
  );

  return await cloudFormation.describeChangeSet(
    new DescribeChangeSetCommand({
      StackName: "reports-stack",
      ChangeSetName: changeSetName,
    }),
  );
}

describe("CloudFormation CreateChangeSetCommand", () => {
  it("reports a Resource the new template adds without creating it", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();

    await deployReportsStack(simAws);

    // When a change set is created from a template with a second Bucket.
    const described = await describeChangeSetFor(simAws, {
      Resources: {
        ...template.Resources,
        ArchiveBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "reports-archive" },
        },
      },
    });

    // Then the change set reports the added Bucket.
    assertIdentical(described.Status, "CREATE_COMPLETE");
    assertIdentical(described.ExecutionStatus, "AVAILABLE");
    assertArrayLength(described.Changes, 1);
    assertObjectMatches(described.Changes[0].ResourceChange, {
      Action: "Add",
      LogicalResourceId: "ArchiveBucket",
      ResourceType: "AWS::S3::Bucket",
    });

    // And nothing has been created, because a change set only says what would
    // happen.
    assertUndefined(simAws.s3().getSimBucketByName("reports-archive"));
  });

  it("reports a changed Resource as a replacement", async () => {
    // Given a deployed Stack whose Parameter holds a Ref to its Bucket.
    const simAws = new SimAws();

    await deployReportsStack(simAws);

    // When a change set renames the Bucket.
    const described = await describeChangeSetFor(simAws, {
      Resources: {
        ...template.Resources,
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "reports-v2" },
        },
      },
    });

    // Then the Bucket and the Parameter naming it are both replacements, since
    // simulated CloudFormation replaces a changed Resource and everything that
    // names it.
    assertArrayLength(described.Changes, 2);
    assertObjectMatches(described.Changes[0].ResourceChange, {
      Action: "Modify",
      LogicalResourceId: "ReportsBucket",
      Replacement: "True",
    });
    assertObjectMatches(described.Changes[1].ResourceChange, {
      Action: "Modify",
      LogicalResourceId: "BucketNameParameter",
      Replacement: "True",
    });

    // And the deployed Bucket is still the one the Stack was created with.
    assertNonNullable(simAws.s3().getSimBucketByName("reports"));
  });

  it("reports a Resource the new template drops", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();

    await deployReportsStack(simAws);

    // When a change set drops the Parameter.
    const described = await describeChangeSetFor(simAws, {
      Resources: { ReportsBucket: reportsBucket },
    });

    // Then the Parameter is reported as a removal.
    assertArrayLength(described.Changes, 1);
    assertObjectMatches(described.Changes[0].ResourceChange, {
      Action: "Remove",
      LogicalResourceId: "BucketNameParameter",
    });
  });

  it("fails a change set that would change nothing", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();

    await deployReportsStack(simAws);

    // When a change set is created from the template the Stack already holds.
    const described = await describeChangeSetFor(simAws, template);

    // Then the change set failed, carrying the reason CloudFormation gives,
    // and it cannot be executed.
    assertIdentical(described.Status, "FAILED");
    assertIdentical(described.ExecutionStatus, "UNAVAILABLE");
    assertIdentical(
      described.StatusReason,
      "The submitted information didn't contain changes. " +
        "Submit different information to create a change set.",
    );
  });

  it("creates a Stack in review for a CREATE change set", async () => {
    // Given a simulation with no Stack of this name.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    // When a CREATE change set is created for it.
    await cloudFormation.createChangeSet(
      new CreateChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-create",
        ChangeSetType: "CREATE",
        TemplateBody: jsonStringify(template),
      }),
    );

    // Then the Stack is there in review, holding no created Resources.
    const stacks = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: "reports-stack" }),
    );

    assertArrayLength(stacks.Stacks, 1);
    assertIdentical(stacks.Stacks[0].StackStatus, "REVIEW_IN_PROGRESS");
    assertUndefined(simAws.s3().getSimBucketByName("reports"));

    // And every Resource in the template is reported as an addition.
    const described = await cloudFormation.describeChangeSet(
      new DescribeChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-create",
      }),
    );

    assertArrayLength(described.Changes, 2);
    assertIdentical(described.Changes[0].ResourceChange.Action, "Add");
    assertIdentical(described.Changes[1].ResourceChange.Action, "Add");
  });

  it("refuses an UPDATE change set against a Stack that is not there", async () => {
    // Given a simulation with no Stack deployed.
    const simAws = new SimAws();

    // When an UPDATE change set names one anyway.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().createChangeSet(
        new CreateChangeSetCommand({
          StackName: "reports-stack",
          ChangeSetName: "reports-change",
          TemplateBody: jsonStringify(template),
        }),
      ),
    );

    // Then it is refused the way CloudFormation refuses it.
    assertIdentical(error.name, "ValidationError");
    assertStringIncludes(error.message, "does not exist");
  });

  it("refuses a second change set under the same name", async () => {
    // Given a Stack holding a change set.
    const simAws = new SimAws();

    await deployReportsStack(simAws);
    await describeChangeSetFor(simAws, {
      Resources: { ReportsBucket: reportsBucket },
    });

    // When another change set is created under the same name.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().createChangeSet(
        new CreateChangeSetCommand({
          StackName: "reports-stack",
          ChangeSetName: "reports-change",
          TemplateBody: jsonStringify({
            Resources: { ReportsBucket: reportsBucket },
          }),
        }),
      ),
    );

    // Then it is refused as an existing change set.
    assertIdentical(error.name, "AlreadyExistsException");
  });
});
