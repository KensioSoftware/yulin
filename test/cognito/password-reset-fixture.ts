/**
 * A pool holding one confirmed user with a password of its own, which is where
 * a password reset test starts from.
 *
 * This lives under `test/` because the lint rules reject a test file exporting
 * helpers alongside its own `describe` calls, and the reset suites all want the
 * same pool.
 */

import { createHmac } from "node:crypto";
import {
  ConfirmSignUpCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
  SignUpCommand,
  type PreventUserExistenceErrorTypes,
  type VerifiedAttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../src/service/cognito/index.js";

/** The user every password reset suite signs up. */
export const resetUsername = "alice";

/** The password that user chooses at sign-up. */
export const resetPassword = "Sup3rSecret!";

/** The password it chooses when it resets. */
export const newResetPassword = "Ev3nBetter!";

/**
 * What a test asks for when it wants a pool to reset a password in.
 */
export interface SimCognitoResetPoolInput {
  /** What the app client is created with, `LEGACY` by default. */
  readonly preventUserExistenceErrors?: PreventUserExistenceErrorTypes;

  /** Whether the app client is created with a secret. */
  readonly generateSecret?: boolean;

  /**
   * The `AutoVerifiedAttributes` the pool is created with, `email` by default.
   * A pool created with none has nowhere to send a reset code.
   */
  readonly autoVerifiedAttributes?: readonly VerifiedAttributeType[];
}

/**
 * A pool whose one user has signed itself up, confirmed, and can sign in.
 */
export interface SimCognitoResetPool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;

  /** The client secret, for a pool asked for an app client with one. */
  readonly clientSecret: string | undefined;
}

/**
 * Build the pool and take its user through sign-up and confirmation.
 */
export async function makeResetPool(
  input: SimCognitoResetPoolInput = {},
): Promise<SimCognitoResetPool> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      AutoVerifiedAttributes: [...(input.autoVerifiedAttributes ?? ["email"])],
    }),
  );

  assertNonNullable(pool.UserPool?.Id, "CreateUserPool answered with a pool");

  const userPoolId = pool.UserPool.Id;
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
      PreventUserExistenceErrors: input.preventUserExistenceErrors,
      GenerateSecret: input.generateSecret,
    }),
  );

  assertNonNullable(
    client.UserPoolClient?.ClientId,
    "CreateUserPoolClient answered with a client id",
  );

  const clientId = client.UserPoolClient.ClientId;
  const clientSecret = client.UserPoolClient.ClientSecret;
  const secretHash =
    clientSecret === undefined
      ? undefined
      : simCognitoResetSecretHash(clientId, clientSecret);

  await cognito.signUp(
    new SignUpCommand({
      ClientId: clientId,
      Username: resetUsername,
      Password: resetPassword,
      SecretHash: secretHash,
      UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
    }),
  );
  await cognito.confirmSignUp(
    new ConfirmSignUpCommand({
      ClientId: clientId,
      Username: resetUsername,
      SecretHash: secretHash,
      ConfirmationCode: cognito
        .userPool(userPoolId)
        .confirmationCode(resetUsername),
    }),
  );

  return { cognito, userPoolId, clientId, clientSecret };
}

/**
 * The `SECRET_HASH` the AWS SDKs compute for the fixture's user.
 */
export function simCognitoResetSecretHash(
  clientId: string,
  clientSecret: string,
): string {
  return createHmac("sha256", clientSecret)
    .update(`${resetUsername}${clientId}`)
    .digest("base64");
}

/**
 * The code the pool issued the fixture's user, which real Cognito would have
 * sent it.
 */
export function resetCodeIn(pool: SimCognitoResetPool): string {
  const code = pool.cognito
    .userPool(pool.userPoolId)
    .confirmationCode(resetUsername);

  assertNonNullable(code, "The pool issued the user a code");

  return code;
}

/**
 * Sign the fixture's user in, answering with the access token it was issued.
 */
export async function signResetUserIn(
  pool: SimCognitoResetPool,
  candidate: string,
): Promise<string | undefined> {
  const signedIn = await pool.cognito.initiateAuth(
    new InitiateAuthCommand({
      ClientId: pool.clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: resetUsername, PASSWORD: candidate },
    }),
  );

  return signedIn.AuthenticationResult?.AccessToken;
}
