import {
  AddUserToGroupCommand,
  CreateAccessKeyCommand,
  CreateGroupCommand,
  CreateUserCommand,
  GetGroupCommand,
  GetUserCommand,
  ListGroupsForUserCommand,
  PutUserPolicyCommand,
  TagUserCommand,
  UpdateGroupCommand,
  UpdateUserCommand,
} from "@aws-sdk/client-iam";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimIamAccessDenied,
  SimIamEntityAlreadyExists,
  SimIamValidationError,
} from "../../error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../policy/sim-iam-policy-document.factory.js";
import type { SimIam } from "../../sim-iam.js";
import type { SimIamUsername } from "../../user/sim-iam-user.js";

/**
 * A simulated IAM holding a User allowed to read objects, in a group, with
 * an access key.
 */
async function withAnalyst(): Promise<{
  readonly iam: SimIam;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}> {
  const iam = new SimAws().account(makeSimAwsAccountId()).iam();
  await iam.createUser(new CreateUserCommand({ UserName: "analyst" }));
  await iam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "analyst",
      PolicyName: "read",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: "s3:GetObject", Resource: "*" },
      }),
    }),
  );
  await iam.createGroup(new CreateGroupCommand({ GroupName: "Readers" }));
  await iam.addUserToGroup(
    new AddUserToGroupCommand({ GroupName: "Readers", UserName: "analyst" }),
  );
  const { AccessKey } = await iam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "analyst" }),
  );

  return {
    iam,
    accessKeyId: AccessKey.AccessKeyId,
    secretAccessKey: AccessKey.SecretAccessKey,
  };
}

describe("Renaming IAM Users and groups", () => {
  it("renames a User, which keeps its ID, policies, groups and keys", async () => {
    // Given a User with a policy, a group and an access key
    const { iam, accessKeyId, secretAccessKey } = await withAnalyst();
    const before = await iam.getUser(
      new GetUserCommand({ UserName: "analyst" }),
    );

    // When it is renamed and moved to another path
    await iam.updateUser(
      new UpdateUserCommand({
        UserName: "analyst",
        NewUserName: "auditor",
        NewPath: "/finance/",
      }),
    );

    // Then it answers to its new name at its new path, in the same group, and
    // a request signed with its key is made as it and allowed by its policy
    const { User } = await iam.getUser(
      new GetUserCommand({ UserName: "auditor" }),
    );
    const { Groups } = await iam.listGroupsForUser(
      new ListGroupsForUserCommand({ UserName: "auditor" }),
    );
    const decision = iam.authorize({
      action: "s3:GetObject",
      resource: "arn:aws:s3:::reports/q1.csv",
      caller: {
        kind: "credentials",
        credentials: { accessKeyId, secretAccessKey },
      },
    });
    assertIdentical(User.UserId, before.User.UserId);
    assertIdentical(
      User.Arn,
      `arn:aws:iam::${iam.accountId}:user/finance/auditor`,
    );
    assertArrayEquals(
      Groups.map((group) => group.GroupName),
      ["Readers"],
    );
    assertTrue(decision.isAllowed);
    assertFalse(iam.users.has("analyst" as SimIamUsername));
  });

  it("renames a group, which keeps its Users", async () => {
    // Given a group with a User in it
    const { iam } = await withAnalyst();

    // When the group is renamed
    await iam.updateGroup(
      new UpdateGroupCommand({ GroupName: "Readers", NewGroupName: "Viewers" }),
    );

    // Then the group answers to its new name, the User is in it, and only its
    // path stays as it was
    const { Group, Users } = await iam.getGroup(
      new GetGroupCommand({ GroupName: "Viewers" }),
    );
    const { Groups } = await iam.listGroupsForUser(
      new ListGroupsForUserCommand({ UserName: "analyst" }),
    );
    assertIdentical(Group.Path, "/");
    assertArrayEquals(
      Users.map((user) => user.UserName),
      ["analyst"],
    );
    assertArrayEquals(
      Groups.map((group) => group.GroupName),
      ["Viewers"],
    );
  });

  it("refuses a new name another User or group already has", async () => {
    // Given a second User and a second group
    const { iam } = await withAnalyst();
    await iam.createUser(new CreateUserCommand({ UserName: "auditor" }));
    await iam.createGroup(new CreateGroupCommand({ GroupName: "Writers" }));

    // When the first of each is renamed to the second's name in another case
    const user = await assertThrowsErrorAsync(async () =>
      iam.updateUser(
        new UpdateUserCommand({ UserName: "analyst", NewUserName: "AUDITOR" }),
      ),
    );
    const group = await assertThrowsErrorAsync(async () =>
      iam.updateGroup(
        new UpdateGroupCommand({
          GroupName: "Readers",
          NewGroupName: "writers",
        }),
      ),
    );

    // Then IAM refuses both
    assertInstanceOf(user, SimIamEntityAlreadyExists);
    assertInstanceOf(group, SimIamEntityAlreadyExists);
  });

  it("needs the rename allowed on the new name as well as the old", async () => {
    // Given a caller allowed to update any User except under /finance/
    const { iam } = await withAnalyst();
    const caller = await iam.makeDeployRole({
      roleName: "deployer",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Action: "*", Resource: "*" },
          {
            Effect: "Deny",
            Action: "iam:UpdateUser",
            Resource: `arn:aws:iam::${iam.accountId}:user/finance/*`,
          },
        ],
      },
    });

    // When it moves the User under /finance/
    const error = await assertThrowsErrorAsync(async () =>
      iam.updateUser(
        new UpdateUserCommand({ UserName: "analyst", NewPath: "/finance/" }),
        { caller },
      ),
    );

    // Then IAM refuses it, and the User stays where it was
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(iam.users.get("analyst" as SimIamUsername)?.path, "/");
  });

  it("carries the User's tags into the check on its new name", async () => {
    // Given a User tagged for finance, and a caller allowed to update Users
    // tagged so
    const { iam } = await withAnalyst();
    await iam.tagUser(
      new TagUserCommand({
        UserName: "analyst",
        Tags: [{ Key: "team", Value: "finance" }],
      }),
    );
    const caller = await iam.makeDeployRole({
      roleName: "finance-admin",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "iam:UpdateUser",
            Resource: "*",
            Condition: {
              StringEquals: { "iam:ResourceTag/team": "finance" },
            },
          },
        ],
      },
    });

    // When it renames the User
    await iam.updateUser(
      new UpdateUserCommand({ UserName: "analyst", NewUserName: "auditor" }),
      { caller },
    );

    // Then the rename is allowed
    assertTrue(iam.users.has("auditor" as SimIamUsername));
  });

  it("refuses a new path IAM refuses", async () => {
    // Given a User and a group
    const { iam } = await withAnalyst();

    // When each is moved to a path holding a space, or past 512 characters
    const spaced = await assertThrowsErrorAsync(async () =>
      iam.updateUser(
        new UpdateUserCommand({ UserName: "analyst", NewPath: "/bad path/" }),
      ),
    );
    const long = await assertThrowsErrorAsync(async () =>
      iam.updateGroup(
        new UpdateGroupCommand({
          GroupName: "Readers",
          NewPath: `/${"p".repeat(511)}/`,
        }),
      ),
    );

    // Then IAM refuses both, and the User stays where it was
    assertInstanceOf(spaced, SimIamValidationError);
    assertInstanceOf(long, SimIamValidationError);
    assertIdentical(iam.users.get("analyst" as SimIamUsername)?.path, "/");
  });
});
