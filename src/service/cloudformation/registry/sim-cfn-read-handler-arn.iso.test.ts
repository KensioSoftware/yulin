import {
  assertStringIncludes,
  assertStringNotEmpty,
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

describe("the ARN a read handler's calls are authorized on", () => {
  it("reads the ARN of a Bucket CloudFormation named off the Bucket itself", async () => {
    // Given a Bucket with a generated name, read through Fn::Sub, and a role
    // denied one of the Bucket's read calls.
    const { simAws, accountId } = readHandlerSimulation();
    const role = await deployRole(simAws, accountId, [
      { Effect: "Allow", Action: "*", Resource: "*" },
      { Effect: "Deny", Action: "s3:GetBucketVersioning", Resource: "*" },
    ]);
    const cloudFormation = simAws.cloudFormation();
    const outputs = {
      // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
      Site: { Value: { "Fn::Sub": "${Site.Arn}/index.html" } },
    };
    const stack = await cloudFormation.deployTemplate({
      stackName: "site",
      caller: role,
      template: {
        Resources: { Site: { Type: "AWS::S3::Bucket" } },
        Outputs: outputs,
      },
    });
    const bucketName = stack.getResource("Site")?.refValue;
    assertStringNotEmpty(bucketName);

    // When another Bucket is added.
    await updateStack(simAws, "site", {
      Resources: { Site: { Type: "AWS::S3::Bucket" }, Logs: addedBucket },
      Outputs: outputs,
    });
    const error = await assertThrowsErrorAsync(async () => {
      await cloudFormation.waitForStackUpdateComplete("site");
    });

    // Then the read was refused on the generated Bucket's ARN.
    assertStringIncludes(
      error.message,
      `s3:GetBucketVersioning on resource: arn:aws:s3:::${bucketName}`,
    );
  });

  it("fills the identifier a service generated from the Resource's Ref", async () => {
    // Given a hosted zone, whose ARN holds the ID Route 53 gave it, read by an
    // output, and a role denied the zone's read call.
    const { simAws, accountId } = readHandlerSimulation();
    const role = await deployRole(simAws, accountId, [
      { Effect: "Allow", Action: "*", Resource: "*" },
      { Effect: "Deny", Action: "route53:GetHostedZone", Resource: "*" },
    ]);
    const cloudFormation = simAws.cloudFormation();
    const resources = {
      Zone: {
        Type: "AWS::Route53::HostedZone",
        Properties: { Name: "example.com" },
      },
    };
    const outputs = {
      NameServers: {
        Value: { "Fn::Join": [",", { "Fn::GetAtt": ["Zone", "NameServers"] }] },
      },
    };
    const stack = await cloudFormation.deployTemplate({
      stackName: "dns",
      caller: role,
      template: { Resources: resources, Outputs: outputs },
    });
    const zoneId = stack.getResource("Zone")?.refValue;
    assertStringNotEmpty(zoneId);

    // When a Bucket is added.
    await updateStack(simAws, "dns", {
      Resources: { ...resources, Logs: addedBucket },
      Outputs: outputs,
    });
    const error = await assertThrowsErrorAsync(async () => {
      await cloudFormation.waitForStackUpdateComplete("dns");
    });

    // Then the call was refused on the zone's own ARN.
    assertStringIncludes(
      error.message,
      `route53:GetHostedZone on resource: arn:aws:route53:::hostedzone/${zoneId}`,
    );
  });

  it("takes a Ref that is an ARN as the whole ARN", async () => {
    // Given a topic with a generated name, whose Ref is its ARN, read by an
    // output, and a role denied the topic's read call.
    const { simAws, accountId } = readHandlerSimulation();
    const role = await deployRole(simAws, accountId, [
      { Effect: "Allow", Action: "*", Resource: "*" },
      { Effect: "Deny", Action: "sns:GetTopicAttributes", Resource: "*" },
    ]);
    const cloudFormation = simAws.cloudFormation();
    const resources = { Alerts: { Type: "AWS::SNS::Topic" } };
    const outputs = {
      Alerts: { Value: { "Fn::GetAtt": ["Alerts", "TopicName"] } },
    };
    const stack = await cloudFormation.deployTemplate({
      stackName: "alerts",
      caller: role,
      template: { Resources: resources, Outputs: outputs },
    });
    const topicArn = stack.getResource("Alerts")?.refValue;
    assertStringNotEmpty(topicArn);

    // When a Bucket is added.
    await updateStack(simAws, "alerts", {
      Resources: { ...resources, Logs: addedBucket },
      Outputs: outputs,
    });
    const error = await assertThrowsErrorAsync(async () => {
      await cloudFormation.waitForStackUpdateComplete("alerts");
    });

    // Then the call was refused on the topic's ARN, not on one nesting it.
    assertStringIncludes(
      error.message,
      `sns:GetTopicAttributes on resource: ${topicArn}`,
    );
  });

  it("decides a read call IAM scopes to no resource type on any resource", async () => {
    // Given a Batch job queue, which sim CloudFormation skips, read by an
    // output, and a role denied the queue's describe call.
    const { simAws, accountId } = readHandlerSimulation();
    const role = await deployRole(simAws, accountId, [
      { Effect: "Allow", Action: "*", Resource: "*" },
      { Effect: "Deny", Action: "batch:DescribeJobQueues", Resource: "*" },
    ]);
    const cloudFormation = simAws.cloudFormation();
    const resources = {
      Queue: {
        Type: "AWS::Batch::JobQueue",
        Properties: { JobQueueName: "reports", Priority: 1 },
      },
    };
    const outputs = {
      Queue: { Value: { "Fn::GetAtt": "Queue.JobQueueArn" } },
    };

    await cloudFormation.deployTemplate({
      stackName: "jobs",
      caller: role,
      template: { Resources: resources, Outputs: outputs },
    });

    // When a Bucket is added.
    await updateStack(simAws, "jobs", {
      Resources: { ...resources, Logs: addedBucket },
      Outputs: outputs,
    });
    const error = await assertThrowsErrorAsync(async () => {
      await cloudFormation.waitForStackUpdateComplete("jobs");
    });

    // Then the call was refused on `*`.
    assertStringIncludes(
      error.message,
      "batch:DescribeJobQueues on resource: *",
    );
  });

  it("refuses an update when a read Resource's ARN cannot be built", async () => {
    // Given a package group, whose ARN format needs a value no property of it
    // holds, read by an output.
    const { simAws, accountId } = readHandlerSimulation();
    const role = await deployRole(simAws, accountId, [
      { Effect: "Allow", Action: "*", Resource: "*" },
    ]);
    const cloudFormation = simAws.cloudFormation();
    const resources = {
      ...mirror,
      Group: {
        Type: "AWS::CodeArtifact::PackageGroup",
        Properties: { DomainName: "chineseboost", Pattern: "/npm/*" },
      },
    };
    const outputs = { Group: { Value: { "Fn::GetAtt": ["Group", "Arn"] } } };

    await cloudFormation.deployTemplate({
      stackName: "artifacts",
      caller: role,
      template: { Resources: resources, Outputs: outputs },
    });

    // When a Bucket is added.
    await updateStack(simAws, "artifacts", {
      Resources: { ...resources, Sources: addedBucket },
      Outputs: outputs,
    });
    const error = await assertThrowsErrorAsync(async () => {
      await cloudFormation.waitForStackUpdateComplete("artifacts");
    });

    // Then the refusal names the variable that could not be filled.
    assertStringIncludes(error.message, "needs EncodedPackageGroupPattern");
  });

  it("fills an ARN's project name from the property the template calls Name", async () => {
    // Given a CodeBuild project, which sim CloudFormation skips, read by an
    // output, and a role denied the project's read call.
    const { simAws, accountId } = readHandlerSimulation();
    const role = await deployRole(simAws, accountId, [
      { Effect: "Allow", Action: "*", Resource: "*" },
      { Effect: "Deny", Action: "codebuild:BatchGetProjects", Resource: "*" },
    ]);
    const cloudFormation = simAws.cloudFormation();
    const resources = {
      Build: { Type: "AWS::CodeBuild::Project", Properties: { Name: "site" } },
    };
    const outputs = { Build: { Value: { "Fn::GetAtt": ["Build", "Arn"] } } };

    await cloudFormation.deployTemplate({
      stackName: "builds",
      caller: role,
      template: { Resources: resources, Outputs: outputs },
    });

    // When a Bucket is added.
    await updateStack(simAws, "builds", {
      Resources: { ...resources, Logs: addedBucket },
      Outputs: outputs,
    });
    const error = await assertThrowsErrorAsync(async () => {
      await cloudFormation.waitForStackUpdateComplete("builds");
    });

    // Then the call was refused on the project its Name names.
    assertStringIncludes(
      error.message,
      `codebuild:BatchGetProjects on resource: arn:aws:codebuild:${readHandlerRegionName}:${accountId}:project/site`,
    );
  });
});
