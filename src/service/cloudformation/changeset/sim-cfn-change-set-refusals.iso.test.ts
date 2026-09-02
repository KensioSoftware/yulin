import { describe, it } from "vitest";
import {
  assertArrayEmpty,
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
  DeleteStackCommand,
  DescribeChangeSetCommand,
  ExecuteChangeSetCommand,
  ListChangeSetsCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "../../aws/sim-aws.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

const reportsBucket = {
  Type: "AWS::S3::Bucket",
  Properties: { BucketName: "reports" },
};

const archiveBucket = {
  Type: "AWS::S3::Bucket",
  Properties: { BucketName: "reports-archive" },
};

const template = { Resources: { ReportsBucket: reportsBucket } };

const withArchive = {
  Resources: { ReportsBucket: reportsBucket, ArchiveBucket: archiveBucket },
};

/**
 * Deploy one Bucket as a Stack, ready for a change set against it.
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

describe("Simulated CloudFormation change set refusals", () => {
  it("refuses a ChangeSetType outside the simulation", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();

    await deployReportsStack(simAws);

    // When a change set asks to import Resources into it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().createChangeSet(
        new CreateChangeSetCommand({
          StackName: "reports-stack",
          ChangeSetName: "reports-import",
          ChangeSetType: "IMPORT",
          TemplateBody: jsonStringify(withArchive),
        }),
      ),
    );

    // Then it is refused by name, because nothing here can adopt a Resource it
    // did not create.
    assertIdentical(error.name, "ValidationError");
    assertStringIncludes(error.message, "IMPORT");
  });

  it("refuses a CREATE change set for a Stack that is already there", async () => {
    // Given a deployed Stack.
    const simAws = new SimAws();

    await deployReportsStack(simAws);

    // When a CREATE change set names it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().createChangeSet(
        new CreateChangeSetCommand({
          StackName: "reports-stack",
          ChangeSetName: "reports-create",
          ChangeSetType: "CREATE",
          TemplateBody: jsonStringify(template),
        }),
      ),
    );

    // Then it is refused as an existing Stack.
    assertIdentical(error.name, "AlreadyExistsException");
  });

  it("describes a change set by the ARN it was created with", async () => {
    // Given a change set against a deployed Stack.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);

    const created = await cloudFormation.createChangeSet(
      new CreateChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-change",
        TemplateBody: jsonStringify(withArchive),
      }),
    );

    // When it is described by its ARN alone, with no Stack name.
    const described = await cloudFormation.describeChangeSet(
      new DescribeChangeSetCommand({ ChangeSetName: created.Id }),
    );

    // Then it is the change set that ARN names.
    assertIdentical(described.ChangeSetName, "reports-change");
    assertStringIncludes(created.Id ?? "", ":changeSet/reports-change/");
  });

  it("takes a change set name that is not there as nothing to delete", async () => {
    // Given a deployed Stack holding no change set.
    const simAws = new SimAws();

    await deployReportsStack(simAws);

    // When a change set that was never created is deleted.
    await simAws.cloudFormation().deleteChangeSet(
      new DeleteChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-change",
      }),
    );

    // Then the call succeeded, because DeleteChangeSet says the change set
    // should be gone and one that never existed satisfies that.
    const listed = await simAws
      .cloudFormation()
      .listChangeSets(
        new ListChangeSetsCommand({ StackName: "reports-stack" }),
      );
    assertArrayEmpty(listed.Summaries);
  });

  it("fails a change set whose Stack has gone since it was created", async () => {
    // Given a change set against a Stack that is then deleted.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);
    await cloudFormation.createChangeSet(
      new CreateChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-change",
        TemplateBody: jsonStringify(withArchive),
      }),
    );

    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: "reports-stack" }),
    );
    await cloudFormation.waitForStackDeleteComplete("reports-stack");

    // When the change set is executed.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.executeChangeSet(
        new ExecuteChangeSetCommand({
          StackName: "reports-stack",
          ChangeSetName: "reports-change",
        }),
      ),
    );

    // Then it is refused for the Stack it names.
    assertIdentical(error.name, "ValidationError");
    assertStringIncludes(error.message, "reports-stack");
  });

  it("gives up on a change set whose Stack has moved on", async () => {
    // Given a change set that only adds a second Bucket.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await deployReportsStack(simAws);
    await cloudFormation.createChangeSet(
      new CreateChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-change",
        TemplateBody: jsonStringify(withArchive),
      }),
    );

    // And an update that renames the Bucket the change set left alone.
    await cloudFormation.updateStack(
      new UpdateStackCommand({
        StackName: "reports-stack",
        TemplateBody: jsonStringify({
          Resources: {
            ReportsBucket: {
              Type: "AWS::S3::Bucket",
              Properties: { BucketName: "reports-v2" },
            },
          },
        }),
      }),
    );
    await cloudFormation.waitForStackUpdateComplete("reports-stack");

    // When the change set is executed.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.executeChangeSet(
        new ExecuteChangeSetCommand({
          StackName: "reports-stack",
          ChangeSetName: "reports-change",
        }),
      ),
    );

    // Then it is refused as obsolete, because what it reports was worked out
    // against a template the Stack has moved on from. Executing it would put
    // the renamed Bucket back, which its Changes never said it would.
    assertIdentical(error.name, "InvalidChangeSetStatusException");
    assertStringIncludes(error.message, "OBSOLETE");
    assertNonNullable(simAws.s3().getSimBucketByName("reports-v2"));
    assertUndefined(simAws.s3().getSimBucketByName("reports-archive"));

    const described = await cloudFormation.describeChangeSet(
      new DescribeChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-change",
      }),
    );
    assertIdentical(described.ExecutionStatus, "OBSOLETE");
  });

  it("records a failed execution on the change set", async () => {
    // Given a CREATE change set whose template names a Role that is not there.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createChangeSet(
      new CreateChangeSetCommand({
        StackName: "policy-stack",
        ChangeSetName: "policy-create",
        ChangeSetType: "CREATE",
        TemplateBody: jsonStringify({
          Resources: {
            ReportsPolicy: {
              Type: "AWS::IAM::Policy",
              Properties: {
                PolicyName: "reports",
                PolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [
                    { Effect: "Allow", Action: "s3:*", Resource: "*" },
                  ],
                },
                Roles: ["missing-role"],
              },
            },
          },
        }),
      }),
    );

    // When it is executed and the deployment it starts fails.
    await cloudFormation.executeChangeSet(
      new ExecuteChangeSetCommand({
        StackName: "policy-stack",
        ChangeSetName: "policy-create",
      }),
    );
    await assertThrowsErrorAsync(async () =>
      cloudFormation.waitForStackDeployComplete("policy-stack"),
    );
    await simAws.backgroundTasksComplete();

    // Then the change set records the failure alongside the Stack's own.
    const described = await cloudFormation.describeChangeSet(
      new DescribeChangeSetCommand({
        StackName: "policy-stack",
        ChangeSetName: "policy-create",
      }),
    );
    assertIdentical(described.ExecutionStatus, "EXECUTE_FAILED");
  });

  it("authorizes a change set named by ARN against the Stack it belongs to", async () => {
    // Given a caller allowed change sets on one Stack only.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    const roleArn = `arn:aws:iam::${simAws.defaultAccountId}:role/Deployer`;

    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Deployer",
        AssumeRolePolicyDocument: jsonStringify({
          Version: "2012-10-17",
          Statement: [],
        }),
      }),
    );
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Deployer",
        PolicyName: "ReportsStackOnly",
        PolicyDocument: jsonStringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "cloudformation:*",
              Resource: `arn:aws:cloudformation:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stack/reports-stack/*`,
            },
          ],
        }),
      }),
    );

    await deployReportsStack(simAws);

    const created = await cloudFormation.createChangeSet(
      new CreateChangeSetCommand({
        StackName: "reports-stack",
        ChangeSetName: "reports-change",
        TemplateBody: jsonStringify(withArchive),
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // When that caller describes it by ARN alone, with no Stack name.
    const described = await cloudFormation.describeChangeSet(
      new DescribeChangeSetCommand({ ChangeSetName: created.Id }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then it is allowed, because the change set says which Stack it belongs
    // to. Authorizing on what the request carried would have asked about every
    // Stack in the Account and Region.
    assertIdentical(described.ChangeSetName, "reports-change");
  });
});
