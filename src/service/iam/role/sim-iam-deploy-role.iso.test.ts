import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimIamAccessDenied } from "../error/sim-iam.error.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

/**
 * An organization denying every Account root everything. It tells a deployment
 * that ran as a Role from one that fell back to the root.
 */
const denyAccountRoot = {
  Version: "2012-10-17",
  Statement: {
    Effect: "Deny",
    Action: "*",
    Resource: "*",
    Condition: { ArnLike: { "aws:PrincipalArn": "arn:aws:iam::*:root" } },
  },
} as const;

const allowS3 = {
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
} as const;

const reportsBucketTemplate = {
  Resources: {
    ReportsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "reports-bucket" },
    },
  },
};

describe("making a Role for a simulated CloudFormation deployment", () => {
  it("hands back a caller the deployment runs as", async () => {
    // Given an organization denying the Account root everything, and a deploy
    // Role made from a policy document allowing S3.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const deployer = await simAws.iam().makeDeployRole({
      roleName: "cdk-exec",
      policyDocument: allowS3,
    });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyAccountRoot);

    // When a Stack is deployed as it.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reports-stack",
      template: reportsBucketTemplate,
      caller: deployer,
    });

    // Then the caller names the Role, and the deployment ran as it rather than
    // as the root the organization denies.
    assertIdentical(deployer.kind, "arn");
    assertIdentical(deployer.arn, `arn:aws:iam::${accountId}:role/cdk-exec`);
    assertIdentical(
      stack.getResource("ReportsBucket")?.status,
      "CREATE_COMPLETE",
    );
    assertNonNullable(simAws.s3().getSimBucketByName("reports-bucket"));
  });

  it("trusts CloudFormation and not whoever asks", async () => {
    // Given a deploy Role.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const deployer = await simAws.iam().makeDeployRole({
      roleName: "cdk-exec",
      policyDocument: allowS3,
    });

    // When the trust policy is read back, and the Account root tries to assume
    // the Role.
    const role = await simAws
      .iam()
      .getRole({ input: { RoleName: "cdk-exec" } });

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: deployer.arn,
          RoleSessionName: "root-session",
        }),
      );
    });

    // Then the trust names the CloudFormation service principal, and reaches
    // nobody else.
    assertStringIncludes(
      role.Role.AssumeRolePolicyDocument ?? "",
      "cloudformation.amazonaws.com",
    );
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "sts:AssumeRole");
  });

  it("takes a policy document as a JSON string", async () => {
    // Given a deploy Role made from the JSON a synthesized policy is carried
    // as rather than the parsed document.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const deployer = await simAws.iam().makeDeployRole({
      roleName: "cdk-exec",
      policyDocument: jsonStringify(allowS3),
    });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyAccountRoot);

    // When a Stack is deployed as it.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reports-stack",
      template: reportsBucketTemplate,
      caller: deployer,
    });

    // Then the string was read as the policy it holds.
    assertIdentical(
      stack.getResource("ReportsBucket")?.status,
      "CREATE_COMPLETE",
    );
  });

  it("takes a policy split across several documents", async () => {
    // Given a deploy Role made from two documents, as a policy too big for one
    // arrives.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const deployer = await simAws.iam().makeDeployRole({
      roleName: "cdk-exec",
      policyDocument: [
        allowS3,
        {
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "kms:*", Resource: "*" },
        },
      ],
    });

    // When a Stack needing something from each document is deployed as it.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reports-stack",
      template: {
        Resources: {
          ...reportsBucketTemplate.Resources,
          ReportsKey: { Type: "AWS::KMS::Key", Properties: {} },
        },
      },
      caller: deployer,
    });

    // Then both documents reached the Role.
    assertIdentical(
      stack.getResource("ReportsBucket")?.status,
      "CREATE_COMPLETE",
    );
    assertIdentical(stack.getResource("ReportsKey")?.status, "CREATE_COMPLETE");
  });

  it("refuses a Resource the policy document leaves out", async () => {
    // Given a deploy Role allowed to read objects and nothing else.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const reader = await simAws.iam().makeDeployRole({
      roleName: "cdk-exec",
      policyDocument: {
        Version: "2012-10-17",
        Statement: { Effect: "Allow", Action: "s3:GetObject", Resource: "*" },
      },
    });

    // When a Stack declaring a Bucket is deployed as it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "reports-stack",
        template: reportsBucketTemplate,
        caller: reader,
      });
    });

    // Then the refusal names the Role the deployment ran as.
    assertStringIncludes(
      error.message,
      `arn:aws:iam::${accountId}:role/cdk-exec is not authorized to perform: s3:CreateBucket`,
    );
  });
});
