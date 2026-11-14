import {
  AddUserToGroupCommand,
  AttachGroupPolicyCommand,
  CreateGroupCommand,
  CreateUserCommand,
  DeleteGroupCommand,
  DeleteGroupPolicyCommand,
  DetachGroupPolicyCommand,
  GetGroupCommand,
  GetGroupPolicyCommand,
  ListAttachedGroupPoliciesCommand,
  ListGroupPoliciesCommand,
  ListGroupsCommand,
  ListGroupsForUserCommand,
  PutGroupPolicyCommand,
  RemoveUserFromGroupCommand,
} from "@aws-sdk/client-iam";
import { faker } from "@faker-js/faker";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringEndsWith,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { jsonStringify } from "../../../../util/type-guard/json.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimIamDeleteConflict,
  SimIamEntityAlreadyExists,
  SimIamLimitExceeded,
  SimIamNoSuchEntity,
} from "../../error/sim-iam.error.js";
import { simIamPolicyDocumentOfSize } from "../../policy/sim-iam-policy-document-of-size.js";
import { simIamPolicyDocumentFactory } from "../../policy/sim-iam-policy-document.factory.js";
import type { SimIam } from "../../sim-iam.js";

const readsArn = "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess";

/**
 * A simulated IAM holding one group and one User outside it, and a way to ask
 * what the User may do.
 */
async function withGroup(): Promise<{
  readonly iam: SimIam;
  readonly groupName: string;
  readonly username: string;
  readonly may: (action: string) => boolean;
}> {
  const iam = new SimAws().account(makeSimAwsAccountId()).iam();
  const groupName = `group-${faker.string.alphanumeric(8)}`;
  const username = `user-${faker.string.alphanumeric(8)}`;
  await iam.createGroup(
    new CreateGroupCommand({ GroupName: groupName, Path: "/teams/" }),
  );
  await iam.createUser(new CreateUserCommand({ UserName: username }));
  const principal = {
    kind: "arn" as const,
    arn: `arn:aws:iam::${iam.accountId}:user/${username}`,
  };

  return {
    iam,
    groupName,
    username,
    may: (action) =>
      iam.authorize({
        action,
        resource: "arn:aws:s3:::reports/summary.csv",
        caller: {
          kind: "resolved",
          principal,
          identityPolicyPrincipal: principal,
        },
      }).isAllowed,
  };
}

describe("IAM groups", () => {
  it("grants a member the group's inline and managed policies", async () => {
    // Given a group allowing writes inline and reads through a managed policy
    const { iam, groupName, username, may } = await withGroup();
    await iam.putGroupPolicy(
      new PutGroupPolicyCommand({
        GroupName: groupName,
        PolicyName: "write",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "s3:PutObject", Resource: "*" },
        }),
      }),
    );
    await iam.attachGroupPolicy(
      new AttachGroupPolicyCommand({
        GroupName: groupName,
        PolicyArn: readsArn,
      }),
    );
    const membership = new AddUserToGroupCommand({
      GroupName: groupName,
      UserName: username,
    });
    const before = [may("s3:GetObject"), may("s3:PutObject")];

    // When the User joins the group, and then leaves it
    await iam.addUserToGroup(membership);
    const asMember = [may("s3:GetObject"), may("s3:PutObject")];
    await iam.removeUserFromGroup(
      new RemoveUserFromGroupCommand(membership.input),
    );

    // Then the User had both grants only while a member
    assertArrayEquals(before, [false, false]);
    assertArrayEquals(asMember, [true, true]);
    assertFalse(may("s3:GetObject"));
  });

  it("describes a group with its members, and lists groups", async () => {
    // Given a group with one member
    const { iam, groupName, username } = await withGroup();
    await iam.addUserToGroup(
      new AddUserToGroupCommand({ GroupName: groupName, UserName: username }),
    );

    // When the group is read, and the groups listed overall and for the User
    const got = await iam.getGroup(
      new GetGroupCommand({ GroupName: groupName }),
    );
    const listed = await iam.listGroups(
      new ListGroupsCommand({ PathPrefix: "/teams/" }),
    );
    const forUser = await iam.listGroupsForUser(
      new ListGroupsForUserCommand({ UserName: username }),
    );

    // Then each answers the group, and the read names its member
    assertStringIncludes(got.Group.Arn, `:group/teams/${groupName}`);
    assertArrayEquals(
      got.Users.map((user) => user.UserName),
      [username],
    );
    assertArrayEquals(
      listed.Groups.map((group) => group.GroupName),
      [groupName],
    );
    assertArrayEquals(
      forUser.Groups.map((group) => group.GroupName),
      [groupName],
    );
  });

  it("reads, lists and removes a group's policies", async () => {
    // Given a group with one inline and one managed policy
    const { iam, groupName } = await withGroup();
    const document = simIamPolicyDocumentFactory.make({
      Statement: { Action: "s3:PutObject", Resource: "*" },
    });
    await iam.putGroupPolicy(
      new PutGroupPolicyCommand({
        GroupName: groupName,
        PolicyName: "write",
        PolicyDocument: document,
      }),
    );
    await iam.attachGroupPolicy(
      new AttachGroupPolicyCommand({
        GroupName: groupName,
        PolicyArn: readsArn,
      }),
    );

    // When they are read and listed, and then removed
    const got = await iam.getGroupPolicy(
      new GetGroupPolicyCommand({ GroupName: groupName, PolicyName: "write" }),
    );
    const inline = await iam.listGroupPolicies(
      new ListGroupPoliciesCommand({ GroupName: groupName }),
    );
    const managed = await iam.listAttachedGroupPolicies(
      new ListAttachedGroupPoliciesCommand({ GroupName: groupName }),
    );
    await iam.deleteGroupPolicy(
      new DeleteGroupPolicyCommand({
        GroupName: groupName,
        PolicyName: "write",
      }),
    );
    await iam.detachGroupPolicy(
      new DetachGroupPolicyCommand({
        GroupName: groupName,
        PolicyArn: readsArn,
      }),
    );

    // Then each was answered, and the group can then be deleted
    assertIdentical(decodeURIComponent(got.PolicyDocument), document);
    assertArrayEquals(inline.PolicyNames, ["write"]);
    assertArrayEquals(
      managed.AttachedPolicies.map((policy) => policy.PolicyArn),
      [readsArn],
    );
    await iam.deleteGroup(new DeleteGroupCommand({ GroupName: groupName }));
    assertInstanceOf(
      await assertThrowsErrorAsync(async () =>
        iam.getGroup(new GetGroupCommand({ GroupName: groupName })),
      ),
      SimIamNoSuchEntity,
    );
  });

  it("refuses to delete a group with a member or a policy", async () => {
    // Given one group with a member and another with a policy
    const { iam, groupName, username } = await withGroup();
    await iam.addUserToGroup(
      new AddUserToGroupCommand({ GroupName: groupName, UserName: username }),
    );
    await iam.createGroup(new CreateGroupCommand({ GroupName: "Readers" }));
    await iam.attachGroupPolicy(
      new AttachGroupPolicyCommand({
        GroupName: "Readers",
        PolicyArn: readsArn,
      }),
    );
    const remove = (GroupName: string) =>
      assertThrowsErrorAsync(async () =>
        iam.deleteGroup(new DeleteGroupCommand({ GroupName })),
      );

    // When each is deleted
    const withMember = await remove(groupName);
    const withPolicy = await remove("Readers");

    // Then IAM refuses both
    assertInstanceOf(withMember, SimIamDeleteConflict);
    assertIdentical(
      withMember.message,
      "Cannot delete entity, must remove users from group first.",
    );
    assertInstanceOf(withPolicy, SimIamDeleteConflict);
  });

  it("refuses a second group of the same name", async () => {
    // Given a group
    const { iam, groupName } = await withGroup();

    // When another is created under its name
    const error = await assertThrowsErrorAsync(async () =>
      iam.createGroup(new CreateGroupCommand({ GroupName: groupName })),
    );

    // Then IAM refuses it
    assertInstanceOf(error, SimIamEntityAlreadyExists);
  });

  it("refuses an eleventh group for one User", async () => {
    // Given a User in ten groups
    const { iam, username } = await withGroup();
    const join = async (index: number): Promise<void> => {
      const GroupName = `g${String(index)}`;
      await iam.createGroup(new CreateGroupCommand({ GroupName }));
      await iam.addUserToGroup(
        new AddUserToGroupCommand({ GroupName, UserName: username }),
      );
    };
    await Promise.all(
      Array.from({ length: 10 }, async (_, index) => join(index)),
    );

    // When it joins an eleventh
    const error = await assertThrowsErrorAsync(async () => join(10));

    // Then IAM refuses it
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(error.message, "Cannot exceed quota for GroupsPerUser: 10");
  });

  it("refuses inline policies on a group that sum past 5,120 characters", async () => {
    // Given a group
    const { iam, groupName } = await withGroup();

    // When an inline policy one character past the limit is put on it
    const oversized = jsonStringify(simIamPolicyDocumentOfSize(5121));
    const error = await assertThrowsErrorAsync(async () =>
      iam.putGroupPolicy(
        new PutGroupPolicyCommand({
          GroupName: groupName,
          PolicyName: "large",
          PolicyDocument: oversized,
        }),
      ),
    );

    // Then IAM refuses it
    assertInstanceOf(error, SimIamLimitExceeded);
    assertStringEndsWith(error.message, `for group ${groupName}`);
  });
});
