import { CreateRoleCommand, GetRoleCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type { SimAwsCaller } from "../../../../aws/caller/sim-aws-caller.js";
import type { SimIam } from "../../../sim-iam.js";
import type { SimIamRoleName } from "../../../role/sim-iam-role.js";
import { jsonStringify } from "../../../../../util/type-guard/json.js";

/**
 * The permissions-boundary guard on iam:CreateRole.
 *
 * An account that requires every Role to carry a boundary writes its
 * CloudFormation execution policy this way, and the CDK
 * `PermissionsBoundary.fromName(...)` aspect puts the ARN on each Role it
 * synthesizes. The condition is what makes the two halves meet.
 */
describe("IAM CreateRole under an iam:PermissionsBoundary condition", () => {
  it("creates the Role a request declares the named boundary on", async () => {
    // Given a deploy Role allowed iam:CreateRole only under the boundary its
    // account requires.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const deployer = await deployRole(simIam, accountId);

    // When it creates a Role declaring that boundary.
    const roleCreation = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ReportsRole",
        AssumeRolePolicyDocument: lambdaTrustPolicy,
        PermissionsBoundary: boundaryArn(accountId),
      }),
      { caller: deployer },
    );

    // Then the condition matched and the Role carries the boundary.
    assertIdentical(roleCreation.Role.RoleName, "ReportsRole");
    assertIdentical(
      simIam.roles.get("ReportsRole" as SimIamRoleName)?.permissionsBoundaryArn,
      boundaryArn(accountId),
    );
  });

  it("refuses a Role declaring a boundary the condition does not name", async () => {
    // Given the same deploy Role.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const deployer = await deployRole(simIam, accountId);

    // When it creates a Role declaring some other policy as its boundary.
    const error = await assertThrowsErrorAsync(async () => {
      await simIam.createRole(
        new CreateRoleCommand({
          RoleName: "UnguardedRole",
          AssumeRolePolicyDocument: lambdaTrustPolicy,
          PermissionsBoundary: `arn:aws:iam::${accountId}:policy/Anything`,
        }),
        { caller: deployer },
      );
    });

    // Then the request was refused and no Role was created.
    assertStringIncludes(
      error.message,
      `arn:aws:iam::${accountId}:role/deployer is not authorized to ` +
        `perform: iam:CreateRole on resource: ` +
        `arn:aws:iam::${accountId}:role/UnguardedRole`,
    );
    assertUndefined(simIam.roles.get("UnguardedRole" as SimIamRoleName));
  });

  it("refuses a Role declaring no boundary at all", async () => {
    // Given the same deploy Role.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.iam();
    const deployer = await deployRole(simIam, accountId);

    // When it creates a Role that leaves PermissionsBoundary out, which
    // leaves the condition key unset.
    const error = await assertThrowsErrorAsync(async () => {
      await simIam.createRole(
        new CreateRoleCommand({
          RoleName: "BareRole",
          AssumeRolePolicyDocument: lambdaTrustPolicy,
        }),
        { caller: deployer },
      );
    });

    // Then the statement matched nothing, which is the guard doing its job.
    assertStringIncludes(error.message, "iam:CreateRole");
    assertUndefined(simIam.roles.get("BareRole" as SimIamRoleName));
  });

  it("leaves the boundary off a Role created without one", async () => {
    // Given an IAM service whose Account root may create any Role.
    const simAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });
    const simIam = simAws.iam();

    // When a Role is created with no boundary.
    await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "PlainRole",
        AssumeRolePolicyDocument: lambdaTrustPolicy,
      }),
    );

    // Then the Role has no attachment to describe, and IAM leaves the field
    // out rather than answering an empty one.
    const roleRead = await simIam.getRole(
      new GetRoleCommand({ RoleName: "PlainRole" }),
    );

    assertUndefined(roleRead.Role.PermissionsBoundary);
    assertUndefined(
      simIam.roles.get("PlainRole" as SimIamRoleName)?.permissionsBoundaryArn,
    );
  });
});

/**
 * The trust a Role a function runs as needs.
 */
const lambdaTrustPolicy = jsonStringify({
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Action: "sts:AssumeRole",
    Principal: { Service: "lambda.amazonaws.com" },
  },
});

/**
 * The boundary policy the account requires every Role to carry.
 */
function boundaryArn(accountId: SimAwsAccountId): string {
  return `arn:aws:iam::${accountId}:policy/DeveloperBoundary`;
}

/**
 * A Role allowed to create Roles only under the account's boundary, which is
 * how the CDK permissions-boundary guard is written.
 */
async function deployRole(
  simIam: SimIam,
  accountId: SimAwsAccountId,
): Promise<SimAwsCaller> {
  const creation = await simIam.createRole({
    input: {
      RoleName: "deployer",
      AssumeRolePolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Principal: { Service: "cloudformation.amazonaws.com" },
        },
      }),
    },
  });

  await simIam.putRolePolicy({
    input: {
      RoleName: "deployer",
      PolicyName: "deployer-policy",
      PolicyDocument: jsonStringify({
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
            Action: [
              "iam:PutRolePolicy",
              "iam:AttachRolePolicy",
              "iam:PassRole",
            ],
            Resource: "*",
          },
        ],
      }),
    },
  });

  return { kind: "arn", arn: creation.Role.Arn };
}
