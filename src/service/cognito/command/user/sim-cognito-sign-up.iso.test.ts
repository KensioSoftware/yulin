import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertStringLength,
  assertThrowsErrorAsync,
  assertUndefined,
  assertUuidV4,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCognitoInvalidPasswordException,
  SimCognitoNotAuthorizedException,
  SimCognitoUsernameExistsException,
  SimCognitoUserNotConfirmedException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const password = "Sup3rSecret!";

interface SimCognitoWithClient {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
}

/**
 * A pool users may sign themselves up in, with a client-side app client.
 */
async function simCognitoWithClient(adminCreateUserConfig?: {
  AllowAdminCreateUserOnly: boolean;
}): Promise<SimCognitoWithClient> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      AdminCreateUserConfig: adminCreateUserConfig,
    }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: pool.UserPool.Id,
      ClientName: "web",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  return {
    cognito,
    userPoolId: pool.UserPool.Id,
    clientId: client.UserPoolClient.ClientId,
  };
}

describe("sim Cognito sign-up", () => {
  it("signs a user up unconfirmed with a sub of its own", async () => {
    // Given a pool with an app client.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    // When someone signs themselves up through it.
    const signedUp = await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "alice",
        Password: password,
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      }),
    );

    // Then the user exists unconfirmed, with the sub Cognito allocated it
    // reported back rather than the username.
    assertFalse(signedUp.UserConfirmed);
    assertNonNullable(signedUp.UserSub);
    assertUuidV4(signedUp.UserSub);

    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(read.UserStatus, "UNCONFIRMED");
  });

  it("issues a confirmation code a test can read from the pool", async () => {
    // Given a pool with an app client.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    // When someone signs themselves up.
    await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "alice",
        Password: password,
      }),
    );

    // Then the code the user would have been sent is readable from the pool,
    // because nothing here delivers a message to read it from.
    const code = cognito.userPool(userPoolId).confirmationCode("alice");

    assertNonNullable(code);
    assertStringLength(code, 6);
  });

  it("refuses signing in as a user that has not confirmed", async () => {
    // Given a user that signed itself up and has not confirmed.
    const { cognito, clientId } = await simCognitoWithClient();
    await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "alice",
        Password: password,
      }),
    );

    // When it signs in with the password it chose.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(
        new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: "USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice", PASSWORD: password },
        }),
      );
    });

    // Then the refusal says the sign-up is what is missing, rather than the
    // password, which is what sends an application to ConfirmSignUp.
    assertInstanceOf(error, SimCognitoUserNotConfirmedException);
    assertIdentical(error.name, "UserNotConfirmedException");
  });

  it("refuses a wrong password before it mentions confirmation", async () => {
    // Given a user that signed itself up and has not confirmed.
    const { cognito, clientId } = await simCognitoWithClient();
    await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "alice",
        Password: password,
      }),
    );

    // When it signs in with the wrong password.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(
        new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: "USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice", PASSWORD: "Wr0ngOne!" },
        }),
      );
    });

    // Then it is refused the way any wrong password is, saying nothing about
    // the account being unconfirmed.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
  });

  it("refuses a username the pool already holds", async () => {
    // Given a user an admin created.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    // When someone signs up with the same username.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.signUp(
        new SignUpCommand({
          ClientId: clientId,
          Username: "alice",
          Password: password,
        }),
      );
    });

    // Then it is refused, as real Cognito refuses it, whichever way the first
    // user got there.
    assertInstanceOf(error, SimCognitoUsernameExistsException);
  });

  it("checks the chosen password against the pool's policy", async () => {
    // Given a pool with an app client.
    const { cognito, clientId } = await simCognitoWithClient();

    // When someone signs up with a password the policy does not allow.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.signUp(
        new SignUpCommand({
          ClientId: clientId,
          Username: "alice",
          Password: "short",
        }),
      );
    });

    // Then it is refused in the same words AdminCreateUser refuses one in.
    assertInstanceOf(error, SimCognitoInvalidPasswordException);
    assertStringIncludes(error.message, "Password not long enough");
  });

  it("refuses a sign-up on a pool only an admin may create users in", async () => {
    // Given a pool created the way a CDK UserPool without selfSignUpEnabled
    // creates one.
    const { cognito, clientId } = await simCognitoWithClient({
      AllowAdminCreateUserOnly: true,
    });

    // When someone tries to sign themselves up.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.signUp(
        new SignUpCommand({
          ClientId: clientId,
          Username: "alice",
          Password: password,
        }),
      );
    });

    // Then it is refused as real Cognito refuses it, rather than making a user
    // the deployed pool would not have.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "AllowAdminCreateUserOnly");
  });

  it("refuses an input about the device a request came from", async () => {
    // Given a pool with an app client.
    const { cognito, clientId } = await simCognitoWithClient();

    // When a sign-up carries the device context threat protection reads.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.signUp(
        new SignUpCommand({
          ClientId: clientId,
          Username: "alice",
          Password: password,
          UserContextData: { IpAddress: "192.0.2.1" },
        }),
      );
    });

    // Then it is refused rather than dropped, because nothing here judges a
    // request by the device it came from.
    assertStringIncludes(error.message, "SignUp UserContextData");
    assertStringIncludes(error.message, "is not simulated");
  });

  it("takes the validation data a pre sign-up trigger would read", async () => {
    // Given a pool with an app client and no pre sign-up trigger.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    // When a sign-up carries validation data.
    await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "alice",
        Password: password,
        ValidationData: [{ Name: "tenant", Value: "acme" }],
      }),
    );

    // Then the sign-up went ahead, and the data reached nothing: real Cognito
    // passes it to the pre sign-up trigger and never stores it on the user.
    const read = await cognito.adminGetUser(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
    );

    assertIdentical(read.UserStatus, "UNCONFIRMED");
    assertUndefined(
      read.UserAttributes?.find(
        (attribute) => attribute.Name === "custom:tenant",
      ),
    );
  });
});
