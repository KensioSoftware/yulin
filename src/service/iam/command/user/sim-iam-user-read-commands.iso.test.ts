import {
  AddUserToGroupCommand,
  CreateAccessKeyCommand,
  CreateGroupCommand,
  CreateLoginProfileCommand,
  CreateUserCommand,
  DeleteAccessKeyCommand,
  DeleteLoginProfileCommand,
  DeleteUserCommand,
  GetLoginProfileCommand,
  GetUserCommand,
  ListAccessKeysCommand,
  ListUsersCommand,
  PutUserPolicyCommand,
  UpdateAccessKeyCommand,
} from "@aws-sdk/client-iam";
import { faker } from "@faker-js/faker";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimIamDeleteConflict,
  SimIamLimitExceeded,
  SimIamNoSuchEntity,
  SimIamValidationError,
} from "../../error/sim-iam.error.js";
import { SimIamInvalidCredentials } from "../../credential/error/sim-iam-credential.error.js";
import type { SimIam } from "../../sim-iam.js";
import { simIamPolicyDocumentFactory } from "../../policy/sim-iam-policy-document.factory.js";

/**
 * A simulated IAM holding one User, under a name of its own.
 */
async function withUser(path = "/"): Promise<{
  readonly iam: SimIam;
  readonly username: string;
}> {
  const iam = new SimAws().account(makeSimAwsAccountId()).iam();
  const username = `user-${faker.string.alphanumeric(8)}`;
  await iam.createUser(
    new CreateUserCommand({ UserName: username, Path: path }),
  );

  return { iam, username };
}

/**
 * An access key for the User, and the caller signing with it.
 */
async function accessKey(
  iam: SimIam,
  username: string,
): Promise<{ readonly accessKeyId: string; readonly caller: SimAwsCaller }> {
  const { AccessKey } = await iam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: username }),
  );
  assertNonNullable(AccessKey);

  return {
    accessKeyId: AccessKey.AccessKeyId,
    caller: {
      kind: "credentials",
      credentials: {
        accessKeyId: AccessKey.AccessKeyId,
        secretAccessKey: AccessKey.SecretAccessKey,
      },
    },
  };
}

describe("IAM GetUser and ListUsers", () => {
  it("describes a named User", async () => {
    // Given a User
    const { iam, username } = await withUser("/analysts/");

    // When it is read by name
    const { User } = await iam.getUser(
      new GetUserCommand({ UserName: username }),
    );

    // Then IAM describes it
    assertIdentical(User.UserName, username);
    assertIdentical(User.Path, "/analysts/");
    assertStringIncludes(User.Arn, `:user/analysts/${username}`);
  });

  it("describes the calling User when the command names none", async () => {
    // Given a User allowed to read itself, signing with its own access key
    const { iam, username } = await withUser();
    await iam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: username,
        PolicyName: "self",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "iam:GetUser", Resource: "*" },
        }),
      }),
    );
    const { caller } = await accessKey(iam, username);

    // When it asks for itself
    const { User } = await iam.getUser(new GetUserCommand({}), { caller });

    // Then IAM answers with that User
    assertIdentical(User.UserName, username);
  });

  it("asks a caller that is no User to name one", async () => {
    // Given the Account root, which is no IAM User
    const { iam } = await withUser();

    // When it asks for itself
    const error = await assertThrowsErrorAsync(async () =>
      iam.getUser(new GetUserCommand({})),
    );

    // Then IAM refuses the request
    assertInstanceOf(error, SimIamValidationError);
  });

  it("lists Users under a path prefix, a page at a time", async () => {
    // Given three Users, two of them under one path
    const { iam } = await withUser("/other/");
    await Promise.all(
      ["b-analyst", "a-analyst"].map(async (name) =>
        iam.createUser(
          new CreateUserCommand({ UserName: name, Path: "/team/" }),
        ),
      ),
    );

    // When the Users under the path are listed one to a page
    const first = await iam.listUsers(
      new ListUsersCommand({ PathPrefix: "/team/", MaxItems: 1 }),
    );
    const second = await iam.listUsers(
      new ListUsersCommand({
        PathPrefix: "/team/",
        MaxItems: 1,
        Marker: first.Marker,
      }),
    );

    // Then the two arrive in name order across two pages
    assertArrayEquals(
      [...first.Users, ...second.Users].map((user) => user.UserName),
      ["a-analyst", "b-analyst"],
    );
    assertTrue(first.IsTruncated);
    assertFalse(second.IsTruncated);
  });
});

describe("IAM access key commands", () => {
  it("lists a User's access keys without their secrets", async () => {
    // Given a User holding an access key
    const { iam, username } = await withUser();
    const { accessKeyId } = await accessKey(iam, username);

    // When its keys are listed
    const listed = await iam.listAccessKeys(
      new ListAccessKeysCommand({ UserName: username }),
    );

    // Then the key is listed, active
    assertArrayEquals(
      listed.AccessKeyMetadata.map(
        ({ AccessKeyId, Status }) => `${AccessKeyId} ${Status}`,
      ),
      [`${accessKeyId} Active`],
    );
  });

  it("stops accepting a key made inactive, and accepts it again once active", async () => {
    // Given a User signing with its own access key
    const { iam, username } = await withUser();
    const { accessKeyId, caller } = await accessKey(iam, username);
    const update = (Status: "Active" | "Inactive") =>
      iam.updateAccessKey(
        new UpdateAccessKeyCommand({
          UserName: username,
          AccessKeyId: accessKeyId,
          Status,
        }),
      );
    const authorize = () =>
      iam.authorize({ action: "s3:GetObject", resource: "*", caller });

    // When the key is made inactive
    await update("Inactive");

    // Then a request signed with it is refused, until the key is active again
    assertInstanceOf(assertThrowsError(authorize), SimIamInvalidCredentials);
    await update("Active");
    assertIdentical(authorize().caller.principal.kind, "arn");
  });

  it("deletes an access key, which then authenticates nothing", async () => {
    // Given a User signing with its own access key
    const { iam, username } = await withUser();
    const { accessKeyId, caller } = await accessKey(iam, username);
    const remove = () =>
      iam.deleteAccessKey(
        new DeleteAccessKeyCommand({
          UserName: username,
          AccessKeyId: accessKeyId,
        }),
      );

    // When the key is deleted
    await remove();

    // Then the key is gone, a request signed with it is refused and a second
    // delete finds nothing
    const listed = await iam.listAccessKeys(
      new ListAccessKeysCommand({ UserName: username }),
    );
    assertArrayEmpty(listed.AccessKeyMetadata);
    assertInstanceOf(
      assertThrowsError(() =>
        iam.authorize({ action: "s3:GetObject", resource: "*", caller }),
      ),
      SimIamInvalidCredentials,
    );
    assertInstanceOf(await assertThrowsErrorAsync(remove), SimIamNoSuchEntity);
  });

  it("refuses a third access key", async () => {
    // Given a User holding two access keys
    const { iam, username } = await withUser();
    await accessKey(iam, username);
    await accessKey(iam, username);

    // When a third is created
    const error = await assertThrowsErrorAsync(async () =>
      accessKey(iam, username),
    );

    // Then IAM refuses it
    assertInstanceOf(error, SimIamLimitExceeded);
    assertIdentical(
      error.message,
      "Cannot exceed quota for AccessKeysPerUser: 2",
    );
  });
});

describe("IAM login profile commands", () => {
  it("describes a login profile without its password, and deletes it", async () => {
    // Given a User with a login profile
    const { iam, username } = await withUser();
    await iam.createLoginProfile(
      new CreateLoginProfileCommand({
        UserName: username,
        Password: faker.internet.password(),
        PasswordResetRequired: true,
      }),
    );
    const get = () =>
      iam.getLoginProfile(new GetLoginProfileCommand({ UserName: username }));

    // When it is read and then deleted
    const { LoginProfile } = await get();
    await iam.deleteLoginProfile(
      new DeleteLoginProfileCommand({ UserName: username }),
    );

    // Then the profile was described, and is gone afterwards
    assertArrayEquals(
      Object.keys(LoginProfile).toSorted((a, b) => a.localeCompare(b)),
      ["CreateDate", "PasswordResetRequired", "UserName"],
    );
    assertTrue(LoginProfile.PasswordResetRequired);
    assertInstanceOf(await assertThrowsErrorAsync(get), SimIamNoSuchEntity);
  });
});

describe("IAM DeleteUser", () => {
  it("refuses a User still holding an access key, a login profile or a group", async () => {
    // Given three Users, each holding one of the three
    const refusal = async (
      give: (iam: SimIam, username: string) => Promise<unknown>,
    ): Promise<string> => {
      const { iam, username } = await withUser();
      await give(iam, username);
      const error = await assertThrowsErrorAsync(async () =>
        iam.deleteUser(new DeleteUserCommand({ UserName: username })),
      );
      assertInstanceOf(error, SimIamDeleteConflict);

      return error.message;
    };

    // When each is deleted
    // Then IAM refuses each, naming what is left to remove
    assertStringIncludes(
      await refusal(async (iam, username) => accessKey(iam, username)),
      "must delete access keys first",
    );
    assertStringIncludes(
      await refusal(async (iam, username) =>
        iam.createLoginProfile(
          new CreateLoginProfileCommand({
            UserName: username,
            Password: faker.internet.password(),
          }),
        ),
      ),
      "must delete login profile first",
    );
    assertStringIncludes(
      await refusal(async (iam, username) => {
        await iam.createGroup(new CreateGroupCommand({ GroupName: "Readers" }));
        await iam.addUserToGroup(
          new AddUserToGroupCommand({
            GroupName: "Readers",
            UserName: username,
          }),
        );
      }),
      "must remove user from all groups first",
    );
  });
});
