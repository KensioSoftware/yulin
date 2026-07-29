import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

describe("Cognito user SDK interception", () => {
  it("routes every user Command through the intercepted client", async () => {
    // Given an intercepted Cognito SDK client with a pool.
    using simSdk = new SimSdk();
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;

    // When ordinary SDK code takes a user through its lifecycle.
    const created = await client.send(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        Password: "Sup3rSecret!",
        Permanent: true,
      }),
    );
    await client.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      }),
    );
    await client.send(
      new AdminDisableUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    const disabled = await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    await client.send(
      new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    const listed = await client.send(
      new ListUsersCommand({ UserPoolId: userPoolId }),
    );

    await client.send(
      new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    const listedAfterDelete = await client.send(
      new ListUsersCommand({ UserPoolId: userPoolId }),
    );

    // Then each Command reached simulated Cognito.
    assertIdentical(created.User?.UserStatus, "FORCE_CHANGE_PASSWORD");
    assertIdentical(disabled.UserStatus, "CONFIRMED");
    assertFalse(disabled.Enabled);
    assertTrue(
      (disabled.UserAttributes ?? []).some(
        (attribute) => attribute.Name === "email",
      ),
    );
    assertArrayEquals(
      listed.Users?.map((user) => user.Username),
      ["alice"],
    );
    assertArrayEquals(listedAfterDelete.Users, []);
  });
});
