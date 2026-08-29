import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringStartsWith,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

/**
 * Chaining one Role into another, which is what a process does when it assumes
 * a Role and then assumes a second one from that session.
 *
 * The caller of the second request is a session, and the Role behind it is
 * what both sides of the decision are written against. The trust policy of the
 * target names that Role, and the identity policy allowing the action belongs
 * to it.
 */
describe("Assuming a Role from an assumed-role session", () => {
  it("matches a trust policy naming the Role behind the session", async () => {
    // Given RoleA allowed to assume, and RoleB trusting RoleA.
    const { simAws, accountId, session } = await chainableRoles();

    // When a session of RoleA assumes RoleB.
    const assumed = await simAws.sts().assumeRole(
      {
        input: {
          RoleArn: `arn:aws:iam::${accountId}:role/RoleB`,
          RoleSessionName: "second",
        },
      },
      { caller: session },
    );

    // Then the session it hands back belongs to RoleB.
    assertStringStartsWith(
      assumed.AssumedRoleUser?.Arn ?? "",
      `arn:aws:sts::${accountId}:assumed-role/RoleB/`,
    );
  });

  it("refuses a session whose Role the trust policy leaves out", async () => {
    // Given RoleB trusting RoleA, and a session of some other Role.
    const { simAws, accountId } = await chainableRoles();

    const error = await assertThrowsErrorAsync(async () => {
      // When a session of RoleC assumes RoleB.
      await simAws.sts().assumeRole(
        {
          input: {
            RoleArn: `arn:aws:iam::${accountId}:role/RoleB`,
            RoleSessionName: "second",
          },
        },
        {
          caller: {
            kind: "resolved",
            principal: {
              kind: "arn",
              arn: `arn:aws:sts::${accountId}:assumed-role/RoleC/other`,
            },
            identityPolicyPrincipal: {
              kind: "arn",
              arn: `arn:aws:iam::${accountId}:role/RoleC`,
            },
          },
        },
      );
    });

    // Then the trust policy refused it, naming the session that asked.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "sts:AssumeRole");
  });

  it("refuses a session whose Role may not assume the target", async () => {
    // Given RoleA trusted by RoleB, with nothing allowing it the action.
    const { simAws, accountId, session } = await chainableRoles({
      allowChaining: false,
    });

    const error = await assertThrowsErrorAsync(async () => {
      // When a session of RoleA assumes RoleB.
      await simAws.sts().assumeRole(
        {
          input: {
            RoleArn: `arn:aws:iam::${accountId}:role/RoleB`,
            RoleSessionName: "second",
          },
        },
        { caller: session },
      );
    });

    // Then the identity side refused it, so the Role's own policies decided
    // the request rather than the session's absence of any.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "sts:AssumeRole");
  });
});

/**
 * RoleA, RoleB trusting RoleA, and a caller standing for a session of RoleA.
 */
async function chainableRoles(
  options: { allowChaining?: boolean } = {},
): Promise<{
  simAws: SimAws;
  accountId: string;
  session: SimAwsCaller;
}> {
  const { allowChaining = true } = options;
  const accountId = makeSimAwsAccountId();
  const simAws = new SimAws({ defaultAccountId: accountId });
  const simIam = simAws.iam();
  const roleA = `arn:aws:iam::${accountId}:role/RoleA`;

  await simIam.createRole(
    new CreateRoleCommand({
      RoleName: "RoleA",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  if (allowChaining) {
    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "RoleA",
        PolicyName: "Chain",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Resource: "*",
          },
        }),
      }),
    );
  }

  await simIam.createRole(
    new CreateRoleCommand({
      RoleName: "RoleB",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: roleA },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  return {
    simAws,
    accountId,
    session: {
      kind: "resolved",
      principal: {
        kind: "arn",
        arn: `arn:aws:sts::${accountId}:assumed-role/RoleA/first`,
      },
      identityPolicyPrincipal: { kind: "arn", arn: roleA },
    },
  };
}
