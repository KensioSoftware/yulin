import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminListGroupsForUserCommand,
  CreateGroupCommand,
  CreateUserPoolCommand,
  ListGroupsCommand,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface SimCognitoWithGroups {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

/**
 * A pool holding alice, and the groups admins, readers and everyone, created
 * in that order and each holding her.
 */
async function simCognitoWithGroups(): Promise<SimCognitoWithGroups> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(created.UserPool?.Id);

  const userPoolId = created.UserPool.Id;

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
  );

  await cognito.createGroup(
    new CreateGroupCommand({
      UserPoolId: userPoolId,
      GroupName: "admins",
      Precedence: 1,
    }),
  );
  await cognito.createGroup(
    new CreateGroupCommand({
      UserPoolId: userPoolId,
      GroupName: "readers",
      Precedence: 2,
    }),
  );
  await cognito.createGroup(
    new CreateGroupCommand({
      UserPoolId: userPoolId,
      GroupName: "everyone",
      Precedence: 3,
    }),
  );

  await cognito.adminAddUserToGroup(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      GroupName: "admins",
    }),
  );
  await cognito.adminAddUserToGroup(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      GroupName: "readers",
    }),
  );
  await cognito.adminAddUserToGroup(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      GroupName: "everyone",
    }),
  );

  return { cognito, userPoolId };
}

describe("sim Cognito group listings", () => {
  it("lists the groups of one pool in creation order", async () => {
    // Given a pool with three groups.
    const { cognito, userPoolId } = await simCognitoWithGroups();

    // When they are listed.
    const listed = await cognito.listGroups(
      new ListGroupsCommand({ UserPoolId: userPoolId }),
    );

    // Then all three come back.
    assertArrayEquals(
      (listed.Groups ?? []).map((group) => group.GroupName),
      ["admins", "readers", "everyone"],
    );
    assertUndefined(listed.NextToken);
  });

  it("pages the group listing by Limit and NextToken", async () => {
    // Given a pool with three groups.
    const { cognito, userPoolId } = await simCognitoWithGroups();

    // When two are asked for, then the rest.
    const firstPage = await cognito.listGroups(
      new ListGroupsCommand({ UserPoolId: userPoolId, Limit: 2 }),
    );
    const secondPage = await cognito.listGroups(
      new ListGroupsCommand({
        UserPoolId: userPoolId,
        Limit: 2,
        NextToken: firstPage.NextToken,
      }),
    );

    // Then the pages carry the groups between them.
    assertArrayEquals(
      (firstPage.Groups ?? []).map((group) => group.GroupName),
      ["admins", "readers"],
    );
    assertArrayEquals(
      (secondPage.Groups ?? []).map((group) => group.GroupName),
      ["everyone"],
    );
    assertUndefined(secondPage.NextToken);
  });

  it("pages a user's groups", async () => {
    // Given a user in three groups.
    const { cognito, userPoolId } = await simCognitoWithGroups();

    // When one is asked for.
    const page = await cognito.adminListGroupsForUser(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        Limit: 1,
      }),
    );

    // Then the strongest precedence comes first, and there is more to read.
    assertArrayEquals(
      (page.Groups ?? []).map((group) => group.GroupName),
      ["admins"],
    );
    assertNonNullable(page.NextToken);
  });

  it("pages the members of a group", async () => {
    // Given a group with one member.
    const { cognito, userPoolId } = await simCognitoWithGroups();

    // When its members are listed.
    const listed = await cognito.listUsersInGroup(
      new ListUsersInGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
        Limit: 60,
      }),
    );

    // Then the member comes back as a user, with the status it is in.
    assertArrayEquals(
      (listed.Users ?? []).map((user) => user.Username),
      ["alice"],
    );
    assertArrayEquals(
      (listed.Users ?? []).map((user) => user.UserStatus),
      ["FORCE_CHANGE_PASSWORD"],
    );
  });

  it("refuses a Limit outside the range Cognito allows", async () => {
    // Given a pool with groups.
    const { cognito, userPoolId } = await simCognitoWithGroups();

    // When more than sixty groups are asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.listGroups(
        new ListGroupsCommand({ UserPoolId: userPoolId, Limit: 61 }),
      );
    });

    // Then it is refused, naming the input the request used.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "Limit must be a whole number");
  });

  it("refuses a NextToken it did not issue", async () => {
    // Given a pool with groups.
    const { cognito, userPoolId } = await simCognitoWithGroups();

    // When a made up token is followed.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.listUsersInGroup(
        new ListUsersInGroupCommand({
          UserPoolId: userPoolId,
          GroupName: "admins",
          NextToken: "somewhere-else",
        }),
      );
    });

    // Then it is refused rather than starting again from the beginning.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "NextToken");
  });
});
