import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamRole } from "../../iam/role/sim-iam-role.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";

/**
 * A deployment into an account that requires a permissions boundary.
 *
 * The execution policy allows iam:CreateRole only under the boundary, and the
 * CDK `PermissionsBoundary.fromName(...)` aspect writes the ARN onto every
 * Role the app synthesizes. A Stack the aspect has not been applied to fails
 * on its first Role, which is what the guard exists to do.
 */
describe("a deployment into an account requiring a permissions boundary", () => {
  it("creates the Role its template declares the boundary on", async () => {
    // Given a deploy Role allowed iam:CreateRole only under the account's
    // boundary.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const deployer = await deployRole(simAws, accountId);

    // When it deploys a Stack whose Role declares that boundary, as the CDK
    // aspect writes it.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reports-stack",
      template: jobStackTemplate(boundaryArn(accountId)),
      caller: deployer,
    });

    // Then the Role was created carrying the boundary the template named.
    assertIdentical(stack.getResource("JobRole")?.status, "CREATE_COMPLETE");

    const role = stack.getResource("JobRole")?.simResource as
      | SimIamRole
      | undefined;

    assertNonNullable(role);
    assertIdentical(role.permissionsBoundaryArn, boundaryArn(accountId));
  });

  it("fails the Role its template leaves the boundary off", async () => {
    // Given the same deploy Role.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const deployer = await deployRole(simAws, accountId);

    // When it deploys a Stack whose Role declares no boundary.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "reports-stack",
        template: jobStackTemplate(undefined),
        caller: deployer,
      });
    });

    // Then the deployment stopped at the Role, naming the deploy Role that
    // was refused.
    assertStringIncludes(
      error.message,
      `arn:aws:iam::${accountId}:role/deployer is not authorized to ` +
        `perform: iam:CreateRole on resource: ` +
        `arn:aws:iam::${accountId}:role/JobRole`,
    );

    const stack = simAws.cloudFormation().getStackByName("reports-stack");

    assertNonNullable(stack);
    assertIdentical(stack.getResource("JobRole")?.status, "CREATE_FAILED");
  });
});

/**
 * The boundary policy the account requires every Role to carry.
 */
function boundaryArn(accountId: SimAwsAccountId): string {
  return `arn:aws:iam::${accountId}:policy/DeveloperBoundary`;
}

/**
 * A Stack declaring one Role, with or without a boundary on it.
 */
function jobStackTemplate(
  permissionsBoundary: string | undefined,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      JobRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "JobRole",
          ...(permissionsBoundary !== undefined && {
            PermissionsBoundary: permissionsBoundary,
          }),
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Action: "sts:AssumeRole",
              Principal: { Service: "lambda.amazonaws.com" },
            },
          },
        },
      },
    },
  };
}

/**
 * A Role a deployment can run as, allowed to create Roles only under the
 * account's boundary.
 */
async function deployRole(
  simAws: SimAws,
  accountId: SimAwsAccountId,
): Promise<SimAwsCaller> {
  return await simAws
    .account(accountId)
    .iam()
    .makeDeployRole({
      roleName: "deployer",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "iam:CreateRole",
            Resource: "*",
            Condition: {
              StringEquals: {
                "iam:PermissionsBoundary": boundaryArn(accountId),
              },
            },
          },
          {
            Effect: "Allow",
            Action: ["cloudformation:*", "iam:PutRolePolicy", "iam:PassRole"],
            Resource: "*",
          },
        ],
      },
    });
}
