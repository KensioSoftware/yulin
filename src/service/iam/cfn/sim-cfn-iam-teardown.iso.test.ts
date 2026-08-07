import {
  assertIdentical,
  assertMapSize,
  assertSetSize,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimIamRole } from "../role/sim-iam-role.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

const readObjectsDocument = {
  Version: "2012-10-17",
  Statement: [
    { Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::*/*" },
  ],
};

const template = {
  Resources: {
    ReadPolicy: {
      Type: "AWS::IAM::ManagedPolicy",
      Properties: {
        ManagedPolicyName: "read-objects",
        PolicyDocument: readObjectsDocument,
      },
    },
    HandlerRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "handler-role",
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
        ManagedPolicyArns: [{ Ref: "ReadPolicy" }],
        Policies: [
          {
            PolicyName: "inline-read",
            PolicyDocument: readObjectsDocument,
          },
        ],
      },
    },
    HandlerDefaultPolicy: {
      Type: "AWS::IAM::Policy",
      Properties: {
        PolicyName: "handler-default",
        Roles: [{ Ref: "HandlerRole" }],
        PolicyDocument: readObjectsDocument,
      },
    },
  },
};

describe("IAM CloudFormation Resource teardown", () => {
  it("takes a Role's policies off it before deleting the Role", async () => {
    // Given a deployed Role carrying an attached managed policy and two inline
    // policies, one declared on the Role and one as its own Resource. IAM
    // refuses DeleteRole while any of them are still on it.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "handler-stack", template });

    const role = stack.resources.get("HandlerRole")?.simResource as
      | SimIamRole
      | undefined;
    assertIdentical(role?.roleName, "handler-role");
    assertSetSize(role.attachedPolicyArns, 1);
    assertMapSize(role.inlinePolicies, 2);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the Role is gone, along with the managed policy it used.
    await assertThrowsErrorAsync(async () =>
      simAws.iam().getRole({ input: { RoleName: "handler-role" } }),
    );
    assertUndefined(simAws.iam().roles.get(role.roleName));
    assertIdentical(
      stack.resources.get("ReadPolicy")?.status,
      "DELETE_COMPLETE",
    );
  });

  it("removes an AWS::IAM::Policy from the Roles it names", async () => {
    // Given a Role declared outside the Stack, so it outlives the teardown and
    // can be asked what is still on it.
    const simAws = new SimAws();
    await simAws.iam().createRole({
      input: {
        RoleName: "standing-role",
        AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument),
      },
    });

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "policy-only-stack",
      template: {
        Resources: {
          StandingPolicy: {
            Type: "AWS::IAM::Policy",
            Properties: {
              PolicyName: "standing-default",
              Roles: ["standing-role"],
              PolicyDocument: readObjectsDocument,
            },
          },
        },
      },
    });

    const role = simAws.iam().roles.get("standing-role" as never);
    assertMapSize(role?.inlinePolicies, 1);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the inline policy is off the Role, which is still there.
    assertMapSize(role.inlinePolicies, 0);
    assertIdentical(
      stack.resources.get("StandingPolicy")?.status,
      "DELETE_COMPLETE",
    );
  });
});
