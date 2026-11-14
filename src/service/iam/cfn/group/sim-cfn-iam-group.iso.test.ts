import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertMapSize,
  assertNonNullable,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIamGroupName } from "../../group/sim-iam-group.js";
import type { SimIamUsername } from "../../user/sim-iam-user.js";

const allow = (Action: string): SimCfnTemplateValueRecord => ({
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Action, Resource: "*" }],
});

/**
 * Deploy IAM Resources, and a way to ask what one of the Users may do.
 */
async function deploy(Resources: SimCfnTemplateValueRecord): Promise<{
  readonly simAws: SimAws;
  readonly teardown: () => Promise<void>;
  readonly may: (username: string, action: string) => boolean;
}> {
  const simAws = new SimAws();
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName: "groups-stack", template: { Resources } });
  const iam = simAws.iam();

  return {
    simAws,
    teardown: async () => {
      await stack.teardown();
    },
    may: (username, action) => {
      const principal = {
        kind: "arn" as const,
        arn: `arn:aws:iam::${iam.accountId}:user/${username}`,
      };

      return iam.authorize({
        action,
        resource: "*",
        caller: {
          kind: "resolved",
          principal,
          identityPolicyPrincipal: principal,
        },
      }).isAllowed;
    },
  };
}

describe("IAM CloudFormation groups", () => {
  it("grants a User the policies of the group it names", async () => {
    // Given a group with an inline policy, a User naming it, and Policy and
    // ManagedPolicy Resources naming the group
    const { simAws, may, teardown } = await deploy({
      Readers: {
        Type: "AWS::IAM::Group",
        Properties: {
          Path: "/teams/",
          Policies: [
            { PolicyName: "read", PolicyDocument: allow("s3:GetObject") },
          ],
        },
      },
      Analyst: {
        Type: "AWS::IAM::User",
        Properties: { UserName: "analyst", Groups: [{ Ref: "Readers" }] },
      },
      Writes: {
        Type: "AWS::IAM::Policy",
        Properties: {
          PolicyName: "write",
          PolicyDocument: allow("s3:PutObject"),
          Groups: [{ Ref: "Readers" }],
        },
      },
      Deletes: {
        Type: "AWS::IAM::ManagedPolicy",
        Properties: {
          PolicyDocument: allow("s3:DeleteObject"),
          Groups: [{ Ref: "Readers" }],
        },
      },
    });

    // When the User's requests are decided
    const allowed = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"].map(
      (action) => may("analyst", action),
    );

    // Then each grant reaches the User through the group, and the Stack tears
    // down cleanly
    assertArrayEquals(allowed, [true, true, true]);
    const [group] = simAws.iam().groups.values();
    assertStringIncludes(group?.arn ?? "", ":group/teams/groups-stack-Readers");
    await teardown();
    assertMapSize(simAws.iam().groups, 0);
    assertMapSize(simAws.iam().users, 0);
  });

  it("adds Users to a group with UserToGroupAddition, and takes them out on teardown", async () => {
    // Given a named group allowed reads, and a User added to it by its own
    // Resource
    const { simAws, may, teardown } = await deploy({
      Readers: {
        Type: "AWS::IAM::Group",
        Properties: {
          GroupName: "readers",
          ManagedPolicyArns: ["arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"],
        },
      },
      Analyst: {
        Type: "AWS::IAM::User",
        Properties: { UserName: "analyst" },
      },
      Membership: {
        Type: "AWS::IAM::UserToGroupAddition",
        Properties: {
          GroupName: { Ref: "Readers" },
          Users: [{ Ref: "Analyst" }],
        },
      },
    });

    // When the User reads, and then the Stack is torn down
    const allowed = may("analyst", "s3:GetObject");
    const group = simAws.iam().groups.get("readers" as SimIamGroupName);
    await teardown();

    // Then the read was allowed, and nothing is left behind
    assertTrue(allowed);
    assertIdentical(group?.groupName, "readers");
    assertMapSize(simAws.iam().groups, 0);
    assertMapSize(simAws.iam().users, 0);
  });

  it("attaches and puts policies on Users, and takes them off on teardown", async () => {
    // Given a User named by a ManagedPolicy and a Policy, and a group whose
    // Arn is an output
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "user-policies-stack",
      template: {
        Resources: {
          Analyst: {
            Type: "AWS::IAM::User",
            Properties: { UserName: "analyst" },
          },
          Readers: { Type: "AWS::IAM::Group" },
          Reads: {
            Type: "AWS::IAM::ManagedPolicy",
            Properties: {
              PolicyDocument: allow("s3:GetObject"),
              Users: [{ Ref: "Analyst" }],
            },
          },
          Writes: {
            Type: "AWS::IAM::Policy",
            Properties: {
              PolicyName: "write",
              PolicyDocument: allow("s3:PutObject"),
              Users: [{ Ref: "Analyst" }],
            },
          },
        },
        Outputs: {
          GroupArn: { Value: { "Fn::GetAtt": ["Readers", "Arn"] } },
        },
      },
    });
    const user = simAws.iam().users.get("analyst" as SimIamUsername);

    // When the Stack is torn down
    const held = [user?.attachedPolicyArns.size, user?.inlinePolicies.size];
    await stack.teardown();

    // Then the User held both policies, the output named the group, and
    // nothing is left
    assertArrayEquals(held, [1, 1]);
    assertStringIncludes(stack.output("GroupArn"), ":group/");
    assertMapSize(simAws.iam().users, 0);
    assertMapSize(simAws.iam().policies, 0);
  });

  it("keeps a User's groups and login profile when a key refuses its deletion", async () => {
    // Given a User in a group with a login profile, and an access key the
    // Stack did not create
    const { simAws, teardown } = await deploy({
      Readers: {
        Type: "AWS::IAM::Group",
        Properties: { GroupName: "readers" },
      },
      Analyst: {
        Type: "AWS::IAM::User",
        Properties: {
          UserName: "analyst",
          Groups: [{ Ref: "Readers" }],
          LoginProfile: { Password: "correct-horse-battery" },
        },
      },
    });
    await simAws.iam().createAccessKey({ input: { UserName: "analyst" } });

    // When the Stack is torn down
    const error = await assertThrowsErrorAsync(teardown);

    // Then the deletion is refused and the User is left as it was
    const user = simAws.iam().users.get("analyst" as SimIamUsername);
    assertNonNullable(user?.loginProfile);
    assertInstanceOf(error, Error);
    assertMapSize(user.groups, 1);
    assertFalse(user.loginProfile.passwordResetRequired);
  });
});
