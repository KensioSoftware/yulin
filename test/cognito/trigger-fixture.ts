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
  type VerifiedAttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "../../src/service/aws/sim-aws-account.js";
import { DEFAULT_SIM_AWS_REGION_NAME } from "../../src/service/aws/sim-aws-region.js";
import type { SimSignUpCommandOutput } from "../../src/service/cognito/command/user/sign-up.command.js";
import type { SimCognitoIdentityProvider } from "../../src/service/cognito/index.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../src/service/lambda/function/sim-lambda-handler.type.js";

/**
 * A trigger handler that hands the event back untouched, which is what a
 * handler with nothing to say has to do.
 */
const passThroughHandler: SimLambdaHandler = (event: unknown) => event;

/** The user every suite in the fixture signs up, creates or signs in. */
export const triggerUsername = "alice";

/** The password the fixture's user signs in with. */
export const triggerPassword = "Sup3rSecret!";

/** The name of the function every trigger in the fixture points at. */
export const triggerFunctionName = "auth-trigger";

/**
 * What a test asks for when it wants a pool with a Lambda trigger on it.
 */
export interface SimCognitoTriggerPoolInput {
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
   * What the function does when a trigger invokes it, as a handler function.
   *
   * This is the quick way to say what a trigger does, and it is ignored when
   * `code` is given as well: the two are alternatives, and the archive wins.
   */
  readonly handler?: SimLambdaHandler | undefined;

  /**
   * A real code archive to run instead of a handler function.
   *
   * Function code that calls another simulated service has to be an archive,
   * because that is what runs in the Lambda vm with the runtime's own AWS SDK
   * provided to it.
   */
  readonly code?: Uint8Array | undefined;

  /** The execution Role the function runs as, and its SDK calls are made as. */
  readonly roleArn?: string | undefined;

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
 * The ARN the fixture's trigger function has.
 *
 * A `LambdaConfig` names the function before the pool exists, so the ARN has to
 * be known before anything is created, which is why it is stated rather than
 * read back off the created function.
 */
export const triggerFunctionArn =
  `arn:aws:lambda:${DEFAULT_SIM_AWS_REGION_NAME}:${DEFAULT_SIM_AWS_ACCOUNT_ID}` +
  `:function:${triggerFunctionName}`;

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

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: triggerFunctionName,
      Role:
        input.roleArn ??
        `arn:aws:iam::${simAws.defaultAccountId}:role/TriggerRole`,
      // A real archive needs the handler naming the module and export the way
      // a deployed function does. A stowed handler function is its own entry
      // point and needs none.
      ...(input.code !== undefined && { Handler: "index.handler" }),
      Code: {
        ZipFile:
          input.code ??
          makeLambdaZipFileInput(input.handler ?? passThroughHandler),
      },
    }),
  );

  const cognito = simAws.cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      LambdaConfig: input.triggers,
      ...(input.autoVerifiedAttributes !== undefined && {
        AutoVerifiedAttributes: [...input.autoVerifiedAttributes],
      }),
    }),
  );

  assertNonNullable(pool.UserPool?.Id, "CreateUserPool answered with a pool");
  assertNonNullable(pool.UserPool.Arn, "The created pool has an ARN");

  const userPoolId = pool.UserPool.Id;
  const userPoolArn = pool.UserPool.Arn;

  if (input.permitted ?? true) {
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: triggerFunctionName,
        StatementId: "AllowCognito",
        Action: "lambda:InvokeFunction",
        Principal: "cognito-idp.amazonaws.com",
        SourceArn: userPoolArn,
      }),
    );
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
