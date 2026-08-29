import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";
import { makeSimAwsAccountId } from "../sim-aws-account.js";
import { SimAws } from "../sim-aws.js";

/**
 * A simulation whose unattributed calls are an operator Role allowed anything.
 *
 * The Role is created inside a run as the Account root, which is the bootstrap
 * a default caller needs: the Role has to exist before it can decide the two
 * commands that create it.
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

  await simAws.runAs(simAws.account().rootPrincipal, async () => {
    await simIamRoleWithPolicyFactory.make(
      { roleName: "Operator", actions: ["*"] },
      simAws,
    );
  });

  return { simAws, operatorArn };
}

/**
 * A Role in one simulation that is allowed nothing at all.
 */
async function bystanderArnIn(simAws: SimAws): Promise<string> {
  const bystander = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "Bystander",
      actions: [],
      caller: simAws.account().rootPrincipal,
    },
    simAws,
  );

  return bystander.Arn;
}

describe("a simulated AWS run-as caller", () => {
  it("decides a direct call inside the run as the ambient caller", async () => {
    // Given a simulation with a Role allowed nothing.
    const simAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });
    const bystanderArn = await bystanderArnIn(simAws);

    // When a service is called directly inside a run as that Role.
    const error = await simAws.runAs(
      { kind: "arn", arn: bystanderArn },
      async () =>
        await assertThrowsErrorAsync(async () => {
          await simAws.ssm().putParameter({
            input: { Name: "/myapp/db-host", Type: "String", Value: "db" },
          });
        }),
    );

    // Then the ambient caller decided it, rather than the Account root the
    // call would otherwise have fallen back to.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, `User: ${bystanderArn}`);
  });

  it("reports the ambient caller as the identity behind the request", async () => {
    // Given a simulation with a Role in it.
    const simAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });
    const bystanderArn = await bystanderArnIn(simAws);

    // When STS is asked who is calling inside a run as that Role.
    const identity = await simAws.runAs(
      { kind: "arn", arn: bystanderArn },
      async () => await simAws.sts().getCallerIdentity({ input: {} }),
    );

    // Then it answered with the Role the run named.
    assertIdentical(identity.Arn, bystanderArn);
  });

  it("lets an operation's own caller beat the ambient one", async () => {
    // Given a simulation with a Role allowed nothing.
    const simAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });
    const bystanderArn = await bystanderArnIn(simAws);
    const root = simAws.account().rootPrincipal;

    // When a call inside a run as that Role names the Account root instead.
    const decision = await simAws.runAs(
      { kind: "arn", arn: bystanderArn },
      () =>
        Promise.resolve(
          simAws.iam().authorize({
            action: "ssm:GetParameter",
            resource: "*",
            caller: root,
          }),
        ),
    );

    // Then the named caller decided it and the ambient Role allowed nothing.
    assertIdentical(
      decision.caller.arn,
      `arn:aws:iam::${simAws.defaultAccountId}:root`,
    );
    assertTrue(decision.isAllowed);
  });

  it("lets the ambient caller beat the simulation's default caller", async () => {
    // Given a simulation whose default caller may do anything, and a Role that
    // may do nothing.
    const { simAws } = await simAwsWithOperator();
    const bystanderArn = await bystanderArnIn(simAws);

    // When a call naming no caller is made inside a run as that Role.
    const decision = await simAws.runAs(
      { kind: "arn", arn: bystanderArn },
      () =>
        Promise.resolve(
          simAws.iam().authorize({ action: "ssm:GetParameter", resource: "*" }),
        ),
    );

    // Then the ambient Role decided it rather than the default caller.
    assertIdentical(decision.caller.arn, bystanderArn);
    assertTrue(decision.isDenied);
  });

  it("leaves another simulation's calls alone", async () => {
    // Given two simulations, each with a Role allowed nothing.
    const simAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });
    const otherSimAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });
    const bystanderArn = await bystanderArnIn(simAws);
    await bystanderArnIn(otherSimAws);

    // When the other simulation is called inside a run on this one.
    const decision = await simAws.runAs(
      { kind: "arn", arn: bystanderArn },
      () =>
        Promise.resolve(
          otherSimAws
            .iam()
            .authorize({ action: "ssm:GetParameter", resource: "*" }),
        ),
    );

    // Then it was decided as its own Account root, which the run never
    // reached: each SimAws is its own simulated universe.
    assertIdentical(
      decision.caller.arn,
      `arn:aws:iam::${otherSimAws.defaultAccountId}:root`,
    );
    assertTrue(decision.isAllowed);
  });

  it("bootstraps the Role a default caller names", async () => {
    // Given a simulation whose default caller is a Role that does not exist
    // yet, so nothing has the policies to create it.
    const { simAws, operatorArn } = await simAwsWithOperator();

    // When a call naming no caller is made outside any run.
    const decision = simAws
      .iam()
      .authorize({ action: "ssm:GetParameter", resource: "*" });

    // Then the Role the run created is what the simulation now falls back to.
    assertIdentical(decision.caller.arn, operatorArn);
    assertTrue(decision.isAllowed);
  });
});
