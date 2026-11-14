import {
  CreateRoleCommand,
  CreateUserCommand,
  DeleteRolePermissionsBoundaryCommand,
  DeleteUserPermissionsBoundaryCommand,
  GetRoleCommand,
  PutRolePermissionsBoundaryCommand,
  PutRolePolicyCommand,
  PutUserPermissionsBoundaryCommand,
  PutUserPolicyCommand,
  UpdateAssumeRolePolicyCommand,
  UpdateRoleCommand,
} from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimIamAccessDenied,
  SimIamValidationError,
} from "../../error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../policy/sim-iam-policy-document.factory.js";

const objectArn = "arn:aws:s3:::reports/summary.csv";
const boundaryArn = "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess";

/**
 * A simulation holding a Role its Account root may assume, allowed to do
 * anything.
 */
async function withRole(): Promise<{
  readonly simAws: SimAws;
  readonly roleArn: string;
}> {
  const simAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });
  const iam = simAws.iam();
  await iam.createRole(
    new CreateRoleCommand({
      RoleName: "Worker",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${iam.accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await iam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "Worker",
      PolicyName: "everything",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: "*", Resource: "*" },
      }),
    }),
  );

  return { simAws, roleArn: `arn:aws:iam::${iam.accountId}:role/Worker` };
}

/**
 * Whether a principal of the Account may write an object.
 */
function mayWrite(simAws: SimAws, arn: string): boolean {
  const principal = { kind: "arn" as const, arn };

  return simAws.iam().authorize({
    action: "s3:PutObject",
    resource: objectArn,
    caller: { kind: "resolved", principal, identityPolicyPrincipal: principal },
  }).isAllowed;
}

describe("IAM UpdateRole", () => {
  it("lengthens the sessions STS issues for a Role", async () => {
    // Given a Role left at the one-hour default
    const { simAws, roleArn } = await withRole();
    const assume = () =>
      simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: roleArn,
          RoleSessionName: "worker",
          DurationSeconds: 7200,
        }),
      );
    const refused = await assertThrowsErrorAsync(assume);

    // When its maximum is raised to two hours, with a new description
    await simAws.iam().updateRole(
      new UpdateRoleCommand({
        RoleName: "Worker",
        MaxSessionDuration: 7200,
        Description: "Runs the nightly batch",
      }),
    );

    // Then a two-hour session is issued, and the Role reports both changes
    assertInstanceOf(refused, SimIamValidationError);
    const lengthened = await assume();
    assertNonNullable(lengthened.Credentials);
    const { Role } = await simAws
      .iam()
      .getRole(new GetRoleCommand({ RoleName: "Worker" }));
    assertIdentical(Role.MaxSessionDuration, 7200);
    assertIdentical(Role.Description, "Runs the nightly batch");
  });

  it("refuses a maximum session outside one to twelve hours", async () => {
    // Given a Role
    const { simAws } = await withRole();

    // When its maximum is set to thirty minutes
    const error = await assertThrowsErrorAsync(async () =>
      simAws.iam().updateRole(
        new UpdateRoleCommand({
          RoleName: "Worker",
          MaxSessionDuration: 1800,
        }),
      ),
    );

    // Then IAM refuses it
    assertInstanceOf(error, SimIamValidationError);
  });
});

describe("IAM UpdateAssumeRolePolicy", () => {
  it("changes who may assume a Role", async () => {
    // Given a Role its Account root may assume
    const { simAws, roleArn } = await withRole();

    // When its trust policy is replaced with one trusting only Lambda
    await simAws.iam().updateAssumeRolePolicy(
      new UpdateAssumeRolePolicyCommand({
        RoleName: "Worker",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const error = await assertThrowsErrorAsync(async () =>
      simAws.sts().assumeRole(
        new AssumeRoleCommand({
          RoleArn: roleArn,
          RoleSessionName: "worker",
        }),
      ),
    );

    // Then the Account root may no longer assume it
    assertInstanceOf(error, SimIamAccessDenied);
  });
});

describe("IAM permissions boundary commands", () => {
  it("caps a Role once a boundary is put on it, and frees it once deleted", async () => {
    // Given a Role allowed to do anything
    const { simAws, roleArn } = await withRole();
    const allowedBefore = mayWrite(simAws, roleArn);

    // When a read-only boundary is put on it, and then deleted
    await simAws.iam().putRolePermissionsBoundary(
      new PutRolePermissionsBoundaryCommand({
        RoleName: "Worker",
        PermissionsBoundary: boundaryArn,
      }),
    );
    const allowedUnderBoundary = mayWrite(simAws, roleArn);
    const { Role } = await simAws
      .iam()
      .getRole(new GetRoleCommand({ RoleName: "Worker" }));
    await simAws
      .iam()
      .deleteRolePermissionsBoundary(
        new DeleteRolePermissionsBoundaryCommand({ RoleName: "Worker" }),
      );

    // Then writes were capped only while the boundary was on
    assertTrue(allowedBefore);
    assertFalse(allowedUnderBoundary);
    assertIdentical(
      Role.PermissionsBoundary?.PermissionsBoundaryArn,
      boundaryArn,
    );
    assertTrue(mayWrite(simAws, roleArn));
  });

  it("caps a User once a boundary is put on it, and frees it once deleted", async () => {
    // Given a User allowed to do anything
    const { simAws } = await withRole();
    const iam = simAws.iam();
    await iam.createUser(new CreateUserCommand({ UserName: "analyst" }));
    await iam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "analyst",
        PolicyName: "everything",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "*", Resource: "*" },
        }),
      }),
    );
    const userArn = `arn:aws:iam::${iam.accountId}:user/analyst`;

    // When a read-only boundary is put on it, and then deleted
    await iam.putUserPermissionsBoundary(
      new PutUserPermissionsBoundaryCommand({
        UserName: "analyst",
        PermissionsBoundary: boundaryArn,
      }),
    );
    const allowedUnderBoundary = mayWrite(simAws, userArn);
    await iam.deleteUserPermissionsBoundary(
      new DeleteUserPermissionsBoundaryCommand({ UserName: "analyst" }),
    );

    // Then writes were capped only while the boundary was on
    assertFalse(allowedUnderBoundary);
    assertTrue(mayWrite(simAws, userArn));
  });

  it("tests the boundary being put as iam:PermissionsBoundary", async () => {
    // Given a session of a Role allowed to put only one boundary
    const { simAws, roleArn } = await withRole();
    const iam = simAws.iam();
    await iam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Worker",
        PolicyName: "everything",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "iam:PutRolePermissionsBoundary",
            Resource: "*",
            Condition: {
              StringEquals: { "iam:PermissionsBoundary": boundaryArn },
            },
          },
        }),
      }),
    );
    const caller: SimAwsCaller = {
      kind: "resolved",
      principal: { kind: "arn", arn: roleArn },
      identityPolicyPrincipal: { kind: "arn", arn: roleArn },
    };
    const put = (PermissionsBoundary: string) =>
      iam.putRolePermissionsBoundary(
        new PutRolePermissionsBoundaryCommand({
          RoleName: "Worker",
          PermissionsBoundary,
        }),
        { caller },
      );

    // When it puts the allowed boundary and another
    await put(boundaryArn);
    const error = await assertThrowsErrorAsync(async () =>
      put("arn:aws:iam::aws:policy/AdministratorAccess"),
    );

    // Then only the other is denied
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
