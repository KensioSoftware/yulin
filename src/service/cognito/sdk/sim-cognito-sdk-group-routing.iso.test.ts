import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  CreateGroupCommand,
  CreateUserPoolCommand,
  DeleteGroupCommand,
  GetGroupCommand,
  ListGroupsCommand,
  ListUsersInGroupCommand,
  UpdateGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

describe("Cognito group SDK interception", () => {
  it("routes every group Command through the intercepted client", async () => {
    // Given an intercepted Cognito SDK client with a pool and a user.
    using simSdk = new SimSdk();
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;

    await client.send(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // When ordinary SDK code takes a group through its lifecycle.
    const created = await client.send(
      new CreateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
        Precedence: 5,
      }),
    );

    await client.send(
      new UpdateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
        Precedence: 1,
      }),
    );

    const read = await client.send(
      new GetGroupCommand({ UserPoolId: userPoolId, GroupName: "admins" }),
    );

    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        GroupName: "admins",
      }),
    );

    const members = await client.send(
      new ListUsersInGroupCommand({
        UserPoolId: userPoolId,
        GroupName: "admins",
      }),
    );
    const forUser = await client.send(
      new AdminListGroupsForUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    await client.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        GroupName: "admins",
      }),
    );

    const listed = await client.send(
      new ListGroupsCommand({ UserPoolId: userPoolId }),
    );

    await client.send(
      new DeleteGroupCommand({ UserPoolId: userPoolId, GroupName: "admins" }),
    );

    const listedAfterDelete = await client.send(
      new ListGroupsCommand({ UserPoolId: userPoolId }),
    );

    // Then each Command reached simulated Cognito.
    assertIdentical(created.Group?.Precedence, 5);
    assertIdentical(read.Group?.Precedence, 1);
    assertArrayEquals(
      (members.Users ?? []).map((user) => user.Username),
      ["alice"],
    );
    assertArrayEquals(
      (forUser.Groups ?? []).map((group) => group.GroupName),
      ["admins"],
    );
    assertArrayEquals(
      (listed.Groups ?? []).map((group) => group.GroupName),
      ["admins"],
    );
    assertArrayEquals(listedAfterDelete.Groups ?? [], []);
  });
});
