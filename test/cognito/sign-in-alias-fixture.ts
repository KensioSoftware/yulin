/**
 * The arrangement the sign-in-by-attribute test files share: a pool created
 * with `UsernameAttributes`, an app client, and a confirmed user signed up by
 * its email address.
 *
 * It lives under `test/` for the same reasons as `test/cognito/cfn-deploy.ts`:
 * a test file cannot export helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else and excluded from the
 * published build.
 */

import type {
  ExplicitAuthFlowsType,
  UsernameAttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AdminConfirmSignUpCommand,
  AdminGetUserCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../src/service/cognito/index.js";
import { simCognitoSecretHash } from "../../src/service/cognito/user-pool/auth/sim-cognito-secret-hash.js";

/**
 * The password the users in these tests sign in with.
 */
export const simCognitoAliasPassword = "Sup3rSecret!";

/**
 * The address the user in these tests signs in by.
 */
export const simCognitoAliasEmail = "alice@example.com";

export interface SimCognitoAliasPoolSetUp {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;

  /** The app client's secret, for a pool asked for a confidential client. */
  readonly clientSecret: string | undefined;
}

export interface SimCognitoAliasPoolOptions {
  /** What the pool signs its users in by, its email address by default. */
  readonly usernameAttributes?: readonly UsernameAttributeType[];

  /** Whether the app client holds a secret, which it does not by default. */
  readonly generateSecret?: boolean;

  /** The flows the app client allows, the password and refresh ones by default. */
  readonly authFlows?: ExplicitAuthFlowsType[];
}

/**
 * A pool that signs its users in by an attribute, with an app client.
 */
export async function simCognitoAliasPool(
  options: SimCognitoAliasPoolOptions = {},
): Promise<SimCognitoAliasPoolSetUp> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      UsernameAttributes: [...(options.usernameAttributes ?? ["email"])],
    }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: pool.UserPool.Id,
      ClientName: "web",
      GenerateSecret: options.generateSecret,
      ExplicitAuthFlows: options.authFlows ?? [
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
      ],
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  return {
    cognito,
    userPoolId: pool.UserPool.Id,
    clientId: client.UserPoolClient.ClientId,
    clientSecret: client.UserPoolClient.ClientSecret,
  };
}

/**
 * The `SECRET_HASH` a request naming a value has to carry, or nothing where
 * the app client holds no secret.
 */
export function simCognitoAliasSecretHash(
  setUp: SimCognitoAliasPoolSetUp,
  username: string,
): string | undefined {
  const { clientId, clientSecret } = setUp;

  if (clientSecret === undefined) {
    return undefined;
  }

  return simCognitoSecretHash(username, clientId, clientSecret);
}

/**
 * Sign a user up by an address and confirm it, answering with the username
 * the pool generated for it.
 *
 * The username is read back through `AdminGetUser`, which is the operation an
 * application would find it with, and which resolves the address to the user
 * on the way.
 */
export async function simCognitoAliasUser(
  setUp: SimCognitoAliasPoolSetUp,
  address: string = simCognitoAliasEmail,
): Promise<string> {
  const { cognito, userPoolId, clientId } = setUp;

  await cognito.signUp(
    new SignUpCommand({
      ClientId: clientId,
      Username: address,
      Password: simCognitoAliasPassword,
      // The hash covers the username the request carries, which is the
      // address here rather than the username the pool goes on to generate.
      SecretHash: simCognitoAliasSecretHash(setUp, address),
    }),
  );

  await cognito.adminConfirmSignUp(
    new AdminConfirmSignUpCommand({
      UserPoolId: userPoolId,
      Username: address,
    }),
  );

  const found = await cognito.adminGetUser(
    new AdminGetUserCommand({ UserPoolId: userPoolId, Username: address }),
  );

  assertNonNullable(found.Username);

  return found.Username;
}
