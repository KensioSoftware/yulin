import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";
import { makeSimAwsAccountId } from "../sim-aws-account.js";
import { SimAws } from "../sim-aws.js";
import type { SimAwsPrincipal } from "./sim-aws-caller.js";

const denyTheRoot = {
  Version: "2012-10-17",
  Statement: {
    Sid: "NotAsRoot",
    Effect: "Deny",
    Action: "*",
    Resource: "*",
    Condition: { ArnLike: { "aws:PrincipalArn": "arn:aws:iam::*:root" } },
  },
} as const;

/**
 * A simulation whose unattributed calls are an operator Role allowed anything.
 *
 * The Role is created as the Account root, because the simulation attributes
 * the two commands that create it to the operator otherwise, and the operator
 * has nothing allowing them until the second of the two has run.
 */
async function simAwsWithOperator(): Promise<{
  simAws: SimAws;
  operatorArn: string;
  root: SimAwsPrincipal;
}> {
  const accountId = makeSimAwsAccountId();
  const operatorArn = `arn:aws:iam::${accountId}:role/Operator`;
  const simAws = new SimAws({
    defaultAccountId: accountId,
    defaultCaller: { kind: "arn", arn: operatorArn },
  });
  const root = simAws.account().rootPrincipal;

  await simIamRoleWithPolicyFactory.make(
    { roleName: "Operator", actions: ["*"], caller: root },
    simAws,
  );

  return { simAws, operatorArn, root };
}

describe("Simulated AWS default caller", () => {
  it("decides a call naming no caller as the default caller", async () => {
    // Given a simulation whose default caller is an operator Role.
    const { simAws, operatorArn } = await simAwsWithOperator();

    // When a call is made without naming one.
    const decision = simAws
      .iam()
      .authorize({ action: "ssm:GetParameter", resource: "*" });

    // Then it was decided as the operator.
    assertIdentical(decision.caller.arn, operatorArn);
  });

  it("reads an Account whose organization denies its root principal", async () => {
    // Given such a simulation, under a policy denying the Account root.
    const { simAws } = await simAwsWithOperator();
    simAws
      .organizations()
      .attachServiceControlPolicy(simAws.defaultAccountId, denyTheRoot);

    // When a test writes and reads a parameter without naming a caller.
    await simAws.ssm().putParameter({
      input: { Name: "/myapp/db-host", Type: "String", Value: "db.internal" },
    });
    const read = await simAws
      .ssm()
      .getParameter({ input: { Name: "/myapp/db-host" } });

    // Then the policy left both alone.
    assertIdentical(read.Parameter?.Value, "db.internal");
  });

  it("denies the same read once the caller is named as the root", async () => {
    // Given the same simulation and policy.
    const { simAws, root } = await simAwsWithOperator();
    simAws
      .organizations()
      .attachServiceControlPolicy(simAws.defaultAccountId, denyTheRoot);

    // When a call names the Account root itself.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .ssm()
        .putParameter(
          { input: { Name: "/myapp/db-host", Type: "String", Value: "x" } },
          { caller: root },
        );
    });

    // Then the policy denied it, so the default caller is what the reads above
    // were decided as rather than the policy failing to apply.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "ssm:PutParameter");
  });

  it("lets an explicit caller override the default", async () => {
    // Given a simulation with a default caller, and a Role allowed nothing.
    const { simAws, root } = await simAwsWithOperator();
    const bystander = await simIamRoleWithPolicyFactory.make(
      { roleName: "Bystander", actions: [], caller: root },
      simAws,
    );

    // When a call names that Role.
    const decision = simAws.iam().authorize({
      action: "ssm:GetParameter",
      resource: "*",
      caller: { kind: "arn", arn: bystander.Arn },
    });

    // Then the named caller decided it, and the default granted it nothing.
    assertIdentical(decision.caller.arn, bystander.Arn);
    assertTrue(decision.isDenied);
  });

  it("lets a run-as caller override the default", async () => {
    // Given a simulation with a default caller, and an intercepted client.
    const { simAws, root } = await simAwsWithOperator();
    const bystander = await simIamRoleWithPolicyFactory.make(
      { roleName: "Bystander", actions: [], caller: root },
      simAws,
    );

    const s3 = new S3Client({ region: "eu-west-1" });
    new SimSdk({ simAws }).intercept(s3);

    // When a Command is sent inside a run as that Role.
    const error = await simAws.runAs(
      { kind: "arn", arn: bystander.Arn },
      async () =>
        await assertThrowsErrorAsync(async () => {
          await s3.send(new CreateBucketCommand({ Bucket: "reports-bucket" }));
        }),
    );

    // Then the ambient caller decided it rather than the default.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, `User: ${bystander.Arn}`);
  });

  it("takes a resolved caller, applying the Role behind a session", async () => {
    // Given a Role, and a default caller standing for a session of it.
    const accountId = makeSimAwsAccountId();
    const roleArn = `arn:aws:iam::${accountId}:role/Operator`;
    const simAws = new SimAws({
      defaultAccountId: accountId,
      defaultCaller: {
        kind: "resolved",
        principal: {
          kind: "arn",
          arn: `arn:aws:sts::${accountId}:assumed-role/Operator/session`,
        },
        identityPolicyPrincipal: { kind: "arn", arn: roleArn },
      },
    });

    await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Operator",
        actions: ["ssm:GetParameter"],
        caller: simAws.account().rootPrincipal,
      },
      simAws,
    );

    // When a call is made without naming a caller.
    const decision = simAws
      .iam()
      .authorize({ action: "ssm:GetParameter", resource: "*" });

    // Then the session made the request and the Role's policies allowed it.
    assertIdentical(
      decision.caller.arn,
      `arn:aws:sts::${accountId}:assumed-role/Operator/session`,
    );
    assertIdentical(decision.caller.identityPolicyArn, roleArn);
    assertTrue(decision.isAllowed);
  });

  it("keeps the Account root's own unrestricted access", async () => {
    // Given a simulation whose default caller is an operator Role.
    const { simAws, root } = await simAwsWithOperator();

    // When the Account root is named as the caller.
    const decision = simAws.iam().authorize({
      action: "ssm:GetParameter",
      resource: "*",
      caller: root,
    });

    // Then it still holds the access AWS gives it, which naming a default
    // caller neither moves nor takes away.
    assertTrue(decision.isAllowed);
  });

  it("decides a call naming no caller as the Account root without a default", () => {
    // Given a simulation told nothing about who its callers are.
    const simAws = new SimAws();

    // When a call is made without naming one.
    const decision = simAws
      .iam()
      .authorize({ action: "ssm:GetParameter", resource: "*" });

    // Then it was decided as the Account root, as it always has been.
    assertIdentical(
      decision.caller.arn,
      `arn:aws:iam::${simAws.defaultAccountId}:root`,
    );
    assertTrue(decision.isAllowed);
  });

  it("suppresses the default for an explicitly anonymous caller", async () => {
    // Given a simulation whose default caller is an operator Role.
    const { simAws } = await simAwsWithOperator();

    // When a call states that it has no identity.
    const decision = simAws.iam().authorize({
      action: "ssm:GetParameter",
      resource: "*",
      caller: { kind: "anonymous" },
    });

    // Then it stayed anonymous and the operator's policies were not applied.
    assertIdentical(decision.caller.principal.kind, "anonymous");
    assertTrue(decision.isDenied);
  });
});
