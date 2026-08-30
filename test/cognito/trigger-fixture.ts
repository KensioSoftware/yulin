/**
 * The parts a user pool trigger test needs before it can say anything about a
 * trigger firing: a function to invoke, the permission that lets Cognito invoke
 * it, a pool naming it, an app client to sign in through, and a user to sign
 * in.
 *
 * These live under `test/` because eslint rejects a test file exporting helpers
 * alongside its own `describe` calls, and several suites need the same pool.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  ConfirmSignUpCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
  type SignUpCommandInput,
  type UserPoolMfaType,
  type VerifiedAttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimSignUpCommandOutput } from "../../src/service/cognito/command/user/sign-up.command.js";
import type { SimCognitoIdentityProvider } from "../../src/service/cognito/index.js";
import {
  makeTriggerFunction,
  permitCognitoTrigger,
  triggerFunctionArn,
  type SimCognitoTriggerFunctionInput,
} from "./trigger-function-fixture.js";

export {
  makeTriggerFunction,
  permitCognitoTrigger,
  triggerFunctionArn,
  triggerFunctionArnIn,
  triggerFunctionName,
} from "./trigger-function-fixture.js";

/** The user every suite in the fixture signs up, creates or signs in. */
export const triggerUsername = "alice";

/** The password the fixture's user signs in with. */
export const triggerPassword = "Sup3rSecret!";

/**
 * What a test asks for when it wants a pool with a Lambda trigger on it.
 */
export interface SimCognitoTriggerPoolInput extends SimCognitoTriggerFunctionInput {
  /** The `LambdaConfig` the pool is created with. */
  readonly triggers: Readonly<Record<string, string>>;

  /**
   * The simulation to build the pool in.
   *
   * A test whose trigger reaches another service creates the table or the
   * Bucket first, so it has to make the simulation itself. Everything else
   * takes a fresh one.
   */
  readonly simAws?: SimAws | undefined;

  /**
   * Whether the function's resource policy admits `cognito-idp.amazonaws.com`
   * for this pool, which is what a CDK `addTrigger` emits an
   * `AWS::Lambda::Permission` for.
   */
  readonly permitted?: boolean | undefined;

  /** The `AutoVerifiedAttributes` the pool is created with. */
  readonly autoVerifiedAttributes?:
    | readonly VerifiedAttributeType[]
    | undefined;

  /** What the pool asks of a second factor, `OFF` by default. */
  readonly mfaConfiguration?: UserPoolMfaType | undefined;
}

/**
 * A pool whose triggers point at a function, and a user ready to sign in.
 */
export interface SimCognitoTriggerPool {
  readonly simAws: SimAws;
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly userPoolArn: string;
  readonly clientId: string;
  readonly functionArn: string;
}

/**
 * Build a pool running the triggers a test named.
 *
 * The order is the one a real deployment has to use: the function first,
 * because the pool names it by ARN, then the pool, then the permission, because
 * that names the pool by ARN in turn.
 */
export async function makeTriggerPool(
  input: SimCognitoTriggerPoolInput,
): Promise<SimCognitoTriggerPool> {
  const simAws = input.simAws ?? new SimAws();

  await makeTriggerFunction(simAws, input);

  const cognito = simAws.cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      LambdaConfig: input.triggers,
      ...(input.autoVerifiedAttributes !== undefined && {
        AutoVerifiedAttributes: [...input.autoVerifiedAttributes],
      }),
      ...(input.mfaConfiguration !== undefined && {
        MfaConfiguration: input.mfaConfiguration,
      }),
    }),
  );

  assertNonNullable(pool.UserPool?.Id, "CreateUserPool answered with a pool");
  assertNonNullable(pool.UserPool.Arn, "The created pool has an ARN");

  const userPoolId = pool.UserPool.Id;
  const userPoolArn = pool.UserPool.Arn;

  if (input.permitted ?? true) {
    await permitCognitoTrigger(simAws, userPoolArn);
  }

  return {
    simAws,
    cognito,
    userPoolId,
    userPoolArn,
    clientId: await makeTriggerClient(cognito, userPoolId),
    functionArn: triggerFunctionArn,
  };
}

/**
 * Add the user the fixture signs in as, with `email` set so a trigger event has
 * an attribute to carry beyond the `sub` every user has.
 *
 * A user left unconfirmed keeps only its temporary password, so its sign-in is
 * answered with the `NEW_PASSWORD_REQUIRED` challenge rather than with tokens.
 */
export async function makeTriggerUser(
  pool: SimCognitoTriggerPool,
  confirmed = true,
): Promise<void> {
  await pool.cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: pool.userPoolId,
      Username: "alice",
      TemporaryPassword: "Temp0rary!",
      UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
    }),
  );

  if (confirmed) {
    await pool.cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: pool.userPoolId,
        Username: "alice",
        Password: triggerPassword,
        Permanent: true,
      }),
    );
  }
}

/**
 * Sign the fixture's user up through its app client.
 *
 * This is the self-service path rather than the admin one, so it is what
 * reaches `PreSignUp_SignUp` and, once confirmed, `PostConfirmation`.
 *
 * The app client, the username and the password are the fixture's own, so a
 * caller names only what the trigger under test reads: the attributes, the
 * validation data and the client metadata.
 */
export async function signUpTriggerUser(
  pool: SimCognitoTriggerPool,
  input: Partial<
    Omit<SignUpCommandInput, "ClientId" | "Password" | "Username">
  > = {},
): Promise<SimSignUpCommandOutput> {
  return await pool.cognito.signUp(
    new SignUpCommand({
      UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      ...input,
      Username: triggerUsername,
      ClientId: pool.clientId,
      Password: triggerPassword,
    }),
  );
}

/**
 * Confirm the signed-up user with the code the pool issued.
 */
export async function confirmTriggerSignUp(
  pool: SimCognitoTriggerPool,
  clientMetadata?: Record<string, string>,
): Promise<void> {
  await pool.cognito.confirmSignUp(
    new ConfirmSignUpCommand({
      ClientId: pool.clientId,
      Username: triggerUsername,
      ConfirmationCode: pool.cognito
        .userPool(pool.userPoolId)
        .confirmationCode(triggerUsername),
      ...(clientMetadata !== undefined && { ClientMetadata: clientMetadata }),
    }),
  );
}

async function makeTriggerClient(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
): Promise<string> {
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      ExplicitAuthFlows: [
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_ADMIN_USER_PASSWORD_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
      ],
    }),
  );

  assertNonNullable(
    client.UserPoolClient?.ClientId,
    "CreateUserPoolClient answered with a client id",
  );

  return client.UserPoolClient.ClientId;
}
