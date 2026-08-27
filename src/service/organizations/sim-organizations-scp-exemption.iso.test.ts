import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../aws/sim-aws-account.js";
import { SimIamPolicyDecisionValue } from "../iam/authorize/sim-iam-decision.js";
import type { SimIam } from "../iam/sim-iam.js";
import type { SimIamPolicyDocument } from "../iam/policy/sim-iam-policy.js";

/**
 * A service control policy denying instance launches to everything but the
 * landing zone roles, in the shape a real organization writes the carve-out.
 */
const denyInstancesOutsideLandingZone: SimIamPolicyDocument = {
  Version: "2012-10-17",
  Statement: {
    Sid: "DenyInstancesOutsideLandingZone",
    Effect: "Deny",
    Action: "ec2:RunInstances",
    Resource: "*",
    Condition: {
      ArnNotLike: {
        "aws:PrincipalArn": [
          "arn:aws:iam::*:role/LandingZone/*",
          "arn:aws:iam::*:role/AWSControlTowerExecution",
        ],
      },
    },
  },
};

/**
 * Create a Role able to launch instances, at the given path.
 */
async function makeLaunchingRole(
  simIam: SimIam,
  accountId: string,
  path: string,
): Promise<string> {
  const roleCreation = await simIam.createRole(
    new CreateRoleCommand({
      RoleName: "InstanceLauncher",
      Path: path,
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

  await simIam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "InstanceLauncher",
      PolicyName: "LaunchInstances",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "ec2:RunInstances",
          Resource: "*",
        },
      }),
    }),
  );

  return roleCreation.Role.Arn;
}

describe("Simulated Organizations service control policy carve-outs", () => {
  it("denies a principal the carve-out leaves out", async () => {
    // Given an organization denying instance launches to every principal but
    // the landing zone roles, and an application Role allowed to launch them.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.account(accountId).iam();
    const roleArn = await makeLaunchingRole(simIam, accountId, "/application/");

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyInstancesOutsideLandingZone);

    // When the application Role asks to launch one.
    const decision = simIam.authorize({
      action: "ec2:RunInstances",
      resource: "*",
      caller: { kind: "arn", arn: roleArn },
    });

    // Then its ARN is outside the exempted patterns, so the deny applies.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
    assertTrue(decision.serviceControlPolicy.isDenied);
  });

  it("leaves a principal the carve-out names alone", async () => {
    // Given the same organization, and a Role on the landing zone path.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const simIam = simAws.account(accountId).iam();
    const roleArn = await makeLaunchingRole(simIam, accountId, "/LandingZone/");

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyInstancesOutsideLandingZone);

    // When it asks to launch an instance.
    const decision = simIam.authorize({
      action: "ec2:RunInstances",
      resource: "*",
      caller: { kind: "arn", arn: roleArn },
    });

    // Then the exemption holds and its identity policy carries it through.
    assertTrue(decision.isAllowed);
  });

  it("denies the Account root, which the carve-out does not name", () => {
    // Given the same organization.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyInstancesOutsideLandingZone);

    // When the Account root, which every permission is otherwise open to,
    // asks to launch an instance.
    const decision = simAws.account(accountId).iam().authorize({
      action: "ec2:RunInstances",
      resource: "*",
    });

    // Then the root ARN is outside the exempted patterns too.
    assertIdentical(decision.value, SimIamPolicyDecisionValue.ExplicitDeny);
  });
});
