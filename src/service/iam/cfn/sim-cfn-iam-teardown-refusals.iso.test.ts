import {
  AddUserToGroupCommand,
  AttachRolePolicyCommand,
  CreatePolicyVersionCommand,
  CreateRoleCommand,
  CreateUserCommand,
} from "@aws-sdk/client-iam";
import {
  assertInstanceOf,
  assertMapSize,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  SimIamAccessDenied,
  SimIamDeleteConflict,
} from "../error/sim-iam.error.js";
import type { SimIamGroupName } from "../group/sim-iam-group.js";
import type { SimIamManagedPolicy } from "../policy/sim-iam-policy.js";
import { simIamPolicyDocumentFactory } from "../policy/sim-iam-policy-document.factory.js";
import type { SimIamUsername } from "../user/sim-iam-user.js";

const readObjects = {
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "*" }],
};

describe("IAM CloudFormation teardown that IAM refuses", () => {
  it("keeps a group's policies when a User outside the Stack is still in it", async () => {
    // Given a Stack's group with a policy, and a User outside the Stack in it
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "group-stack",
      template: {
        Resources: {
          Readers: {
            Type: "AWS::IAM::Group",
            Properties: {
              GroupName: "readers",
              Policies: [{ PolicyName: "read", PolicyDocument: readObjects }],
            },
          },
        },
      },
    });
    const iam = simAws.iam();
    await iam.createUser(new CreateUserCommand({ UserName: "outsider" }));
    await iam.addUserToGroup(
      new AddUserToGroupCommand({ GroupName: "readers", UserName: "outsider" }),
    );

    // When the Stack is torn down
    const error = await assertThrowsErrorAsync(async () => stack.teardown());

    // Then IAM refuses the deletion, and the group keeps its policy
    const group = iam.groups.get("readers" as SimIamGroupName);
    assertNonNullable(group);
    assertInstanceOf(error, SimIamDeleteConflict);
    assertMapSize(group.inlinePolicies, 1);
  });

  it("deletes a Managed Policy's other versions before deleting it", async () => {
    // Given a Stack's Managed Policy given a second version outside the Stack
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "policy-stack",
      template: {
        Resources: {
          Reads: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: { PolicyDocument: readObjects },
          },
        },
      },
    });
    const policy = stack.getResource("Reads")?.simResource as
      | SimIamManagedPolicy
      | undefined;
    assertNonNullable(policy);
    await simAws.iam().createPolicyVersion(
      new CreatePolicyVersionCommand({
        PolicyArn: policy.arn,
        PolicyDocument: JSON.stringify(readObjects),
      }),
    );

    // When the Stack is torn down
    await stack.teardown();

    // Then the policy is gone
    assertMapSize(simAws.iam().policies, 0);
  });

  it("refuses a Managed Policy for a Role already at its quota before creating it", async () => {
    // Given a Role carrying twenty managed policies
    const simAws = new SimAws();
    const iam = simAws.iam();
    await iam.createRole(
      new CreateRoleCommand({
        RoleName: "Busy",
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    await Promise.all(
      Array.from({ length: 20 }, async (_, index) =>
        iam.attachRolePolicy(
          new AttachRolePolicyCommand({
            RoleName: "Busy",
            PolicyArn: `arn:aws:iam::${iam.accountId}:policy/P${String(index)}`,
          }),
        ),
      ),
    );

    // When a Stack attaches a new Managed Policy to it
    await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "quota-stack",
        template: {
          Resources: {
            Reads: {
              Type: "AWS::IAM::ManagedPolicy",
              Properties: { PolicyDocument: readObjects, Roles: ["Busy"] },
            },
          },
        },
      }),
    );

    // Then no policy was created
    assertMapSize(iam.policies, 0);
  });

  it("refuses a User naming more than ten groups before creating it", async () => {
    // Given a User naming eleven groups
    const simAws = new SimAws();
    const Groups: SimCfnTemplateValueRecord[] = Array.from(
      { length: 11 },
      (_, index) => ({ Ref: `G${String(index)}` }),
    );
    const groups = Object.fromEntries(
      Array.from({ length: 11 }, (_, index) => [
        `G${String(index)}`,
        { Type: "AWS::IAM::Group" },
      ]),
    );

    // When it is deployed
    await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "joiner-stack",
        template: {
          Resources: {
            ...groups,
            Joiner: {
              Type: "AWS::IAM::User",
              Properties: { UserName: "joiner", Groups },
            },
          },
        },
      }),
    );

    // Then the User was never created
    assertMapSize(simAws.iam().users, 0);
  });

  it("removes a User's group memberships as the caller, and keeps them when denied", async () => {
    // Given a Stack deployed as a Role denied RemoveUserFromGroup, holding a
    // User in a group
    const simAws = new SimAws();
    const deployer = await simAws.iam().makeDeployRole({
      roleName: "deployer",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Action: "*", Resource: "*" },
          { Effect: "Deny", Action: "iam:RemoveUserFromGroup", Resource: "*" },
        ],
      },
    });
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "member-stack",
      caller: deployer,
      template: {
        Resources: {
          Readers: { Type: "AWS::IAM::Group", Properties: { GroupName: "r" } },
          Analyst: {
            Type: "AWS::IAM::User",
            Properties: { UserName: "analyst", Groups: [{ Ref: "Readers" }] },
          },
        },
      },
    });

    // When the Stack is torn down
    const error = await assertThrowsErrorAsync(async () => stack.teardown());

    // Then the membership was not removed
    const user = simAws.iam().users.get("analyst" as SimIamUsername);
    assertNonNullable(user);
    assertInstanceOf(error, SimIamAccessDenied);
    assertMapSize(user.groups, 1);
  });
});
