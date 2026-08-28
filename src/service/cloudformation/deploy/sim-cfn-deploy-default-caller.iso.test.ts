import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

/**
 * An organization denying its Accounts' root principals everything.
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

const reportsBucketTemplate = {
  Resources: {
    ReportsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "reports-bucket" },
    },
  },
};

/**
 * A simulation whose unattributed calls are an operator Role.
 *
 * The Role is created as the Account root, which the policy under test is
 * attached after.
 */
async function simAwsWithOperator(
  actions: readonly string[],
): Promise<{ simAws: SimAws; operatorArn: string }> {
  const accountId = makeSimAwsAccountId();
  const operatorArn = `arn:aws:iam::${accountId}:role/Operator`;
  const simAws = new SimAws({
    defaultAccountId: accountId,
    defaultCaller: { kind: "arn", arn: operatorArn },
  });

  await simIamRoleWithPolicyFactory.make(
    { roleName: "Operator", actions, caller: simAws.account().rootPrincipal },
    simAws,
  );

  return { simAws, operatorArn };
}

describe("a simulated CloudFormation deployment under a default caller", () => {
  it("creates Resources as the default caller when it names none", async () => {
    // Given a simulation whose default caller may create Buckets, under an
    // organization denying the Account root everything.
    const { simAws } = await simAwsWithOperator(["s3:*"]);
    simAws
      .organizations()
      .attachServiceControlPolicy(simAws.defaultAccountId, denyAccountRoot);

    // When a Stack naming no caller of its own is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reports-stack",
      template: reportsBucketTemplate,
    });
    await stack.waitForDeployComplete();

    // Then the default caller carried the deployment past the policy.
    assertNonNullable(
      simAws.s3().getSimBucketByName("reports-bucket"),
      "the deployed Bucket",
    );
  });

  it("fails a Resource the default caller may not create", async () => {
    // Given a simulation whose default caller may do nothing with S3.
    const { simAws, operatorArn } = await simAwsWithOperator(["ssm:*"]);

    // When a Stack naming no caller of its own is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "reports-stack",
        template: reportsBucketTemplate,
      });
      await stack.waitForDeployComplete();
    });

    // Then the deployment was decided as the default caller, and says so.
    assertStringIncludes(error.message, `User: ${operatorArn}`);
    assertIdentical(
      simAws
        .cloudFormation()
        .getStackByName("reports-stack")
        ?.getResource("ReportsBucket")?.status,
      "CREATE_FAILED",
    );
  });

  it("lets the deployment's own caller override the default", async () => {
    // Given a simulation whose default caller may do nothing with S3, and a
    // deploy Role that may.
    const { simAws } = await simAwsWithOperator(["ssm:*"]);
    const deployer = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Deployer",
        actions: ["s3:*"],
        caller: simAws.account().rootPrincipal,
      },
      simAws,
    );

    // When a Stack naming that Role is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reports-stack",
      template: reportsBucketTemplate,
      caller: { kind: "arn", arn: deployer.Arn },
    });
    await stack.waitForDeployComplete();

    // Then the Role the deployment named created the Bucket.
    assertNonNullable(
      simAws.s3().getSimBucketByName("reports-bucket"),
      "the deployed Bucket",
    );
  });
});
