/**
 * The arrangement the user self-service test files share: a pool, an app
 * client, a confirmed user and the access token that user signed in with.
 *
 * It lives under `test/` for the same reasons as `test/cognito/cfn-deploy.ts`:
 * a test file cannot export helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else and excluded from the
 * published build.
 */

import type {
  AttributeType,
  ExplicitAuthFlowsType,
  UserPoolMfaType,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../src/service/cognito/index.js";

/**
 * The password the user in these tests signs in with.
 */
export const simCognitoPassword = "Sup3rSecret!";

/**
 * The username the user in these tests holds.
 */
export const simCognitoUsername = "alice";

export interface SimCognitoSignedInSetUp {
  readonly simAws: SimAws;
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly accessToken: string;
}

export interface SimCognitoSignedInOptions {
  /** The attributes the user is created with, none by default. */
  readonly attributes?: AttributeType[];

  /**
   * What the pool asks of a second factor, `OFF` by default.
   *
   * A pool created `OPTIONAL` challenges the users that go on to register a
   * factor, and the user here has none when it is signed in, so the sign-in
   * this fixture ends with is answered with tokens either way.
   */
  readonly mfaConfiguration?: UserPoolMfaType;

  /**
   * The authentication flows the app client supports, the client-side password
   * flow by default.
   */
  readonly explicitAuthFlows?: ExplicitAuthFlowsType[];
}

/**
 * A confirmed user of a pool, signed in and holding its access token.
 */
export async function simCognitoSignedIn(
  options: SimCognitoSignedInOptions = {},
): Promise<SimCognitoSignedInSetUp> {
  const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
  const cognito = simAws.cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      ...(options.mfaConfiguration !== undefined && {
        MfaConfiguration: options.mfaConfiguration,
      }),
    }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const userPoolId = pool.UserPool.Id;
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      ExplicitAuthFlows: options.explicitAuthFlows ?? [
        "ALLOW_USER_PASSWORD_AUTH",
      ],
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  const clientId = client.UserPoolClient.ClientId;

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: simCognitoUsername,
      ...(options.attributes !== undefined && {
        UserAttributes: options.attributes,
      }),
    }),
  );
  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: simCognitoUsername,
      Password: simCognitoPassword,
      Permanent: true,
    }),
  );

  const signedIn = await cognito.initiateAuth(
    new InitiateAuthCommand({
      ClientId: clientId,
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: {
        USERNAME: simCognitoUsername,
        PASSWORD: simCognitoPassword,
      },
    }),
  );

  assertNonNullable(signedIn.AuthenticationResult?.AccessToken);

  return {
    simAws,
    cognito,
    userPoolId,
    clientId,
    accessToken: signedIn.AuthenticationResult.AccessToken,
  };
}
