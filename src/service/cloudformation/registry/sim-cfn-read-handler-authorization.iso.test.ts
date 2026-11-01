import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  addedBucket,
  deployRole,
  readHandlerRegionName,
  readHandlerSimulation,
  updateStack,
} from "./sim-cfn-read-handler.fixture.js";

const mirror = {
  Domain: {
    Type: "AWS::CodeArtifact::Domain",
    Properties: { DomainName: "chineseboost" },
  },
  Repository: {
    Type: "AWS::CodeArtifact::Repository",
    Properties: { DomainName: "chineseboost", RepositoryName: "npm" },
    DependsOn: "Domain",
  },
};

const repositoryArnOutput = {
  RepositoryArn: { Value: { "Fn::GetAtt": ["Repository", "Arn"] } },
};

/**
 * Everything the stack's own Resources need, apart from the read handler call
 * the CodeArtifact repository's update failed on in November 2026.
 */
const scopedPolicy = [
  { Effect: "Allow", Action: "s3:*", Resource: "*" },
  {
    Effect: "Allow",
    Action: [
      "codeartifact:CreateDomain",
      "codeartifact:DescribeDomain",
      "codeartifact:CreateRepository",
      "codeartifact:DescribeRepository",
      "codeartifact:ListTagsForResource",
    ],
    Resource: "*",
  },
];

describe("authorizing CloudFormation's read handlers on a Stack update", () => {
  it("refuses an update whose output reads an unchanged repository the role may not read", async () => {
    // Given a CodeArtifact mirror deployed with an output reading the
    // repository's ARN, and a role missing GetRepositoryPermissionsPolicy.
    const { simAws, accountId } = readHandlerSimulation();
    const role = await deployRole(simAws, accountId, scopedPolicy);
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.deployTemplate({
      stackName: "artifacts",
      caller: role,
      template: { Resources: mirror, Outputs: repositoryArnOutput },
    });

    // When a Bucket is added to the Stack as that role.
    await updateStack(simAws, "artifacts", {
      Resources: { ...mirror, Sources: addedBucket },
      Outputs: repositoryArnOutput,
    });
    const error = await assertThrowsErrorAsync(async () => {
      await cloudFormation.waitForStackUpdateComplete("artifacts");
    });

    // Then the repository's read handler was refused on the repository, and
    // the update rolled back.
    assertStringIncludes(
      error.message,
      `is not authorized to perform: codeartifact:GetRepositoryPermissionsPolicy on resource: arn:aws:codeartifact:${readHandlerRegionName}:${accountId}:repository/chineseboost/npm`,
    );
    assertIdentical(error.name, "AccessDenied");
    assertIdentical(
      cloudFormation.getStackByName("artifacts")?.status,
      "UPDATE_ROLLBACK_COMPLETE",
    );
  });

  it("applies the same update once the role may make every read handler call", async () => {
    // Given the same Stack, and the role granted the call it was missing.
    const { simAws, accountId } = readHandlerSimulation();
    const role = await deployRole(simAws, accountId, [
      ...scopedPolicy,
      {
        Effect: "Allow",
        Action: "codeartifact:GetRepositoryPermissionsPolicy",
        Resource: `arn:aws:codeartifact:${readHandlerRegionName}:${accountId}:repository/chineseboost/npm`,
      },
    ]);
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.deployTemplate({
      stackName: "artifacts",
      caller: role,
      template: { Resources: mirror, Outputs: repositoryArnOutput },
    });

    // When the Bucket is added.
    await updateStack(simAws, "artifacts", {
      Resources: { ...mirror, Sources: addedBucket },
      Outputs: repositoryArnOutput,
    });
    await cloudFormation.waitForStackUpdateComplete("artifacts");

    // Then the update completed.
    assertIdentical(
      cloudFormation.getStackByName("artifacts")?.status,
      "UPDATE_COMPLETE",
    );
  });

  it("calls no read handler for an unchanged Resource nothing reads an attribute of", async () => {
    // Given the mirror deployed with no output, and the role still missing
    // the read call.
    const { simAws, accountId } = readHandlerSimulation();
    const role = await deployRole(simAws, accountId, scopedPolicy);
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.deployTemplate({
      stackName: "artifacts",
      caller: role,
      template: { Resources: mirror },
    });

    // When the Bucket is added.
    await updateStack(simAws, "artifacts", {
      Resources: { ...mirror, Sources: addedBucket },
    });
    await cloudFormation.waitForStackUpdateComplete("artifacts");

    // Then nothing needed the repository's read handler.
    assertIdentical(
      cloudFormation.getStackByName("artifacts")?.status,
      "UPDATE_COMPLETE",
    );
  });

  it("calls nothing for a Resource type the snapshot has no read handler for", async () => {
    // Given an EventBridge rule, which the snapshot leaves out, read by an
    // output, and a role denied the rule's describe call.
    const { simAws, accountId } = readHandlerSimulation();
    const role = await deployRole(simAws, accountId, [
      { Effect: "Allow", Action: "*", Resource: "*" },
      { Effect: "Deny", Action: "events:DescribeRule", Resource: "*" },
    ]);
    const cloudFormation = simAws.cloudFormation();
    const resources = {
      Nightly: {
        Type: "AWS::Events::Rule",
        Properties: { ScheduleExpression: "rate(1 day)" },
      },
    };
    const outputs = { Rule: { Value: { "Fn::GetAtt": ["Nightly", "Arn"] } } };

    await cloudFormation.deployTemplate({
      stackName: "schedules",
      caller: role,
      template: { Resources: resources, Outputs: outputs },
    });

    // When a Bucket is added.
    await updateStack(simAws, "schedules", {
      Resources: { ...resources, Logs: addedBucket },
      Outputs: outputs,
    });
    await cloudFormation.waitForStackUpdateComplete("schedules");

    // Then the update completed.
    assertIdentical(
      cloudFormation.getStackByName("schedules")?.status,
      "UPDATE_COMPLETE",
    );
  });
});
