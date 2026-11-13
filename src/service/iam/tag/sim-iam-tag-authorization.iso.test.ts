import {
  CreateRoleCommand,
  GetRoleCommand,
  TagRoleCommand,
  UntagRoleCommand,
} from "@aws-sdk/client-iam";
import { assertIdentical, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { simIamPolicyDocumentFactory } from "../policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../role/sim-iam-role-with-policy.factory.js";
import type { SimIamPolicyDocumentStatement } from "../policy/sim-iam-policy.js";

/**
 * A trust policy naming the Account root, which none of these tests is about.
 */
function trustPolicy(simAws: SimAws): string {
  return simIamPolicyDocumentFactory.make({
    Statement: {
      Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
      Action: "sts:AssumeRole",
    },
  });
}

/**
 * A caller holding one policy statement, created by the Account root.
 */
async function callerWith(
  simAws: SimAws,
  statement: SimIamPolicyDocumentStatement,
): Promise<SimAwsCaller> {
  const simIam = simAws.iam();
  const root: SimAwsCaller = {
    kind: "arn",
    arn: `arn:aws:iam::${simAws.defaultAccountId}:root`,
  };

  await simIam.createRole(
    new CreateRoleCommand({
      RoleName: "Operator",
      AssumeRolePolicyDocument: trustPolicy(simAws),
    }),
    { caller: root },
  );
  await simIam.putRolePolicy(
    {
      input: {
        RoleName: "Operator",
        PolicyName: "OperatorPolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: statement,
        }),
      },
    },
    { caller: root },
  );

  return {
    kind: "arn",
    arn: `arn:aws:iam::${simAws.defaultAccountId}:role/Operator`,
  };
}

describe("sim IAM tag-based authorization", () => {
  it("requires iam:TagRole to create a Role with tags", async () => {
    // Given a caller allowed iam:CreateRole and nothing else
    const simAws = new SimAws();
    const caller = await callerWith(simAws, {
      Effect: "Allow",
      Action: "iam:CreateRole",
      Resource: "*",
    });

    // When it creates a Role without tags, then one with a tag
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "UntaggedRole",
        AssumeRolePolicyDocument: trustPolicy(simAws),
      }),
      { caller },
    );
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.iam().createRole(
        new CreateRoleCommand({
          RoleName: "TaggedRole",
          AssumeRolePolicyDocument: trustPolicy(simAws),
          Tags: [{ Key: "team", Value: "reports" }],
        }),
        { caller },
      );
    });

    // Then only the tagged Role needs iam:TagRole, as on AWS
    assertIdentical(error.name, "AccessDenied");
  });

  it("confines tagging to the keys aws:TagKeys allows", async () => {
    // Given a caller allowed to tag Roles with the team key only
    const simAws = new SimAws();
    const caller = await callerWith(simAws, {
      Effect: "Allow",
      Action: ["iam:TagRole", "iam:UntagRole"],
      Resource: "*",
      Condition: { "ForAllValues:StringEquals": { "aws:TagKeys": "team" } },
    });

    // When it tags the team key, and then untags the stage key
    await simAws.iam().tagRole(
      new TagRoleCommand({
        RoleName: "Operator",
        Tags: [{ Key: "team", Value: "reports" }],
      }),
      { caller },
    );
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .iam()
        .untagRole(
          new UntagRoleCommand({ RoleName: "Operator", TagKeys: ["stage"] }),
          { caller },
        );
    });

    // Then the key outside the allowed set is refused
    assertIdentical(error.name, "AccessDenied");
  });

  it("allows an action on a Role by its iam:ResourceTag", async () => {
    // Given a caller allowed to read Roles tagged team=reports
    const simAws = new SimAws();
    const caller = await callerWith(simAws, {
      Effect: "Allow",
      Action: "iam:GetRole",
      Resource: "*",
      Condition: { StringEquals: { "iam:ResourceTag/team": "reports" } },
    });
    await simIamRoleWithPolicyFactory.make({ roleName: "OrdersRole" }, simAws);
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "ReportsRole",
        AssumeRolePolicyDocument: trustPolicy(simAws),
        Tags: [{ Key: "Team", Value: "reports" }],
      }),
    );

    // When it reads the tagged Role, and then the untagged one
    const tagged = await simAws
      .iam()
      .getRole(new GetRoleCommand({ RoleName: "ReportsRole" }), { caller });
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .iam()
        .getRole(new GetRoleCommand({ RoleName: "OrdersRole" }), { caller });
    });

    // Then the tag key matches whatever its case, and the untagged Role is
    // refused
    assertIdentical(tagged.Role.RoleName, "ReportsRole");
    assertIdentical(error.name, "AccessDenied");
  });
});
