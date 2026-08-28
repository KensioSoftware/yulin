import { assertIdentical, assertStringStartsWith } from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../aws/sim-aws-account.js";
import { SimAws } from "../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../iam/role/sim-iam-role-with-policy.factory.js";

/**
 * A simulation whose unattributed calls are an operator Role allowed anything.
 *
 * The Role is created as the Account root, because the simulation attributes
 * the commands that create it to the operator otherwise, and the operator has
 * nothing allowing them until the last of those commands has run.
 */
async function simAwsWithOperator(): Promise<{
  simAws: SimAws;
  operatorArn: string;
}> {
  const accountId = makeSimAwsAccountId();
  const operatorArn = `arn:aws:iam::${accountId}:role/Operator`;
  const simAws = new SimAws({
    defaultAccountId: accountId,
    defaultCaller: { kind: "arn", arn: operatorArn },
  });

  await simIamRoleWithPolicyFactory.make(
    {
      roleName: "Operator",
      actions: ["*"],
      caller: simAws.account().rootPrincipal,
    },
    simAws,
  );

  return { simAws, operatorArn };
}

describe("Simulated STS under a default caller", () => {
  it("reports the default caller from GetCallerIdentity", async () => {
    // Given a simulation whose default caller is an operator Role.
    const { simAws, operatorArn } = await simAwsWithOperator();

    // When a request that names no caller asks who it is.
    const identity = await simAws.sts().getCallerIdentity({});

    // Then STS answers with the operator rather than the Account root.
    assertIdentical(identity.Arn, operatorArn);
    assertIdentical(identity.Account, simAws.defaultAccountId);
  });

  it("reports the Account root where the simulation names no default", async () => {
    // Given a simulation told nothing about who its callers are.
    const simAws = new SimAws();

    // When a request that names no caller asks who it is.
    const identity = await simAws.sts().getCallerIdentity({});

    // Then STS answers with the Account root, as it always has.
    assertIdentical(
      identity.Arn,
      `arn:aws:iam::${simAws.defaultAccountId}:root`,
    );
  });

  it("assumes a Role as the default caller", async () => {
    // Given a simulation whose default caller may assume a Role that trusts it.
    const { simAws, operatorArn } = await simAwsWithOperator();
    const root = simAws.account().rootPrincipal;

    await simAws.iam().createRole(
      {
        input: {
          RoleName: "Reporting",
          AssumeRolePolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: {
              Effect: "Allow",
              Principal: { AWS: operatorArn },
              Action: "sts:AssumeRole",
            },
          }),
        },
      },
      { caller: root },
    );

    // When a request naming no caller assumes it.
    const session = await simAws.sts().assumeRole({
      input: {
        RoleArn: `arn:aws:iam::${simAws.defaultAccountId}:role/Reporting`,
        RoleSessionName: "reporting",
      },
    });

    // Then the trust policy matched the operator, so the session exists.
    assertStringStartsWith(
      session.AssumedRoleUser?.Arn ?? "",
      `arn:aws:sts::${simAws.defaultAccountId}:assumed-role/Reporting/`,
    );
  });
});
