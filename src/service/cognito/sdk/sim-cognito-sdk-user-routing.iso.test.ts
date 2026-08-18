import {
  AdminConfirmSignUpCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserMFAPreferenceCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AssociateSoftwareTokenCommand,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  ForgotPasswordCommand,
  GetUserCommand,
  InitiateAuthCommand,
  ListUsersCommand,
  ResendConfirmationCodeCommand,
  SetUserMFAPreferenceCommand,
  SignUpCommand,
  VerifySoftwareTokenCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertFalse,
  assertIdentical,
  assertTrue,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

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

  it("routes every sign-up Command through the intercepted client", async () => {
    // Given an intercepted Cognito SDK client with a pool and an app client.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        AutoVerifiedAttributes: ["email"],
      }),
    );
    const userPoolId = pool.UserPool?.Id;
    assertTypeString(userPoolId);

    const appClient = await client.send(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );

    // When ordinary SDK code signs a user up and confirms it.
    const signedUp = await client.send(
      new SignUpCommand({
        ClientId: appClient.UserPoolClient?.ClientId,
        Username: "alice",
        Password: "Sup3rSecret!",
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      }),
    );

    await client.send(
      new ResendConfirmationCodeCommand({
        ClientId: appClient.UserPoolClient?.ClientId,
        Username: "alice",
      }),
    );

    await client.send(
      new ConfirmSignUpCommand({
        ClientId: appClient.UserPoolClient?.ClientId,
        Username: "alice",
        ConfirmationCode: simAws
          .cognitoIdentityProvider()
          .userPool(userPoolId)
          .confirmationCode("alice"),
      }),
    );

    const confirmed = await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // Then each Command reached simulated Cognito.
    assertFalse(signedUp.UserConfirmed);
    assertIdentical(confirmed.UserStatus, "CONFIRMED");
    assertTrue(
      (confirmed.UserAttributes ?? []).some(
        (attribute) =>
          attribute.Name === "email_verified" && attribute.Value === "true",
      ),
    );
  });

  it("routes every password reset Command through the intercepted client", async () => {
    // Given an intercepted Cognito SDK client with a confirmed user.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({
        PoolName: "myapp-users",
        AutoVerifiedAttributes: ["email"],
      }),
    );
    const userPoolId = pool.UserPool?.Id;
    assertTypeString(userPoolId);

    const appClient = await client.send(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
        ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
      }),
    );

    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      }),
    );
    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        Password: "Sup3rSecret!",
        Permanent: true,
      }),
    );

    // When ordinary SDK code takes a user through a password reset.
    await client.send(
      new AdminResetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    const reset = await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );
    const asked = await client.send(
      new ForgotPasswordCommand({
        ClientId: appClient.UserPoolClient?.ClientId,
        Username: "alice",
      }),
    );

    await client.send(
      new ConfirmForgotPasswordCommand({
        ClientId: appClient.UserPoolClient?.ClientId,
        Username: "alice",
        ConfirmationCode: simAws
          .cognitoIdentityProvider()
          .userPool(userPoolId)
          .confirmationCode("alice"),
        Password: "Ev3nBetter!",
      }),
    );

    const confirmed = await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // Then each Command reached simulated Cognito.
    assertIdentical(reset.UserStatus, "RESET_REQUIRED");
    assertIdentical(asked.CodeDeliveryDetails?.DeliveryMedium, "EMAIL");
    assertIdentical(confirmed.UserStatus, "CONFIRMED");
  });

  it("routes every MFA registration Command through the intercepted client", async () => {
    // Given an intercepted Cognito SDK client with a signed-in user.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;
    assertTypeString(userPoolId);

    const appClient = await client.send(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
        ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
      }),
    );

    await client.send(
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

    const signedIn = await client.send(
      new InitiateAuthCommand({
        ClientId: appClient.UserPoolClient?.ClientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
      }),
    );
    const AccessToken = signedIn.AuthenticationResult?.AccessToken;

    // When ordinary SDK code registers an authenticator app and turns it on.
    const associated = await client.send(
      new AssociateSoftwareTokenCommand({ AccessToken }),
    );

    await client.send(
      new VerifySoftwareTokenCommand({
        AccessToken,
        UserCode: simAws
          .cognitoIdentityProvider()
          .userPool(userPoolId)
          .softwareTokenCode("alice"),
      }),
    );
    await client.send(
      new SetUserMFAPreferenceCommand({
        AccessToken,
        SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
      }),
    );

    const read = await client.send(new GetUserCommand({ AccessToken }));

    await client.send(
      new AdminSetUserMFAPreferenceCommand({
        UserPoolId: userPoolId,
        Username: "alice",
        SoftwareTokenMfaSettings: { Enabled: false },
      }),
    );

    const cleared = await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // Then each Command reached simulated Cognito.
    assertTypeString(associated.SecretCode);
    assertArrayEquals(read.UserMFASettingList, ["SOFTWARE_TOKEN_MFA"]);
    assertIdentical(read.PreferredMfaSetting, "SOFTWARE_TOKEN_MFA");
    assertUndefined(cleared.UserMFASettingList);
  });

  it("routes AdminConfirmSignUp through the intercepted client", async () => {
    // Given an intercepted Cognito SDK client with an unconfirmed user.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    using simSdk = new SimSdk({ simAws });
    simSdk.intercept(CognitoIdentityProviderClient);

    const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });
    const pool = await client.send(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = pool.UserPool?.Id;
    const appClient = await client.send(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
      }),
    );

    await client.send(
      new SignUpCommand({
        ClientId: appClient.UserPoolClient?.ClientId,
        Username: "alice",
        Password: "Sup3rSecret!",
      }),
    );

    // When an admin confirms the user rather than the user confirming itself.
    await client.send(
      new AdminConfirmSignUpCommand({
        UserPoolId: userPoolId,
        Username: "alice",
      }),
    );

    // Then the Command reached simulated Cognito.
    const confirmed = await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(confirmed.UserStatus, "CONFIRMED");
  });
});
