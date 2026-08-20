import { AsyncMappedFactory } from "@kensio/part-factory";

import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoRefreshTokenRotationType } from "../client/sim-cognito-refresh-token-rotation.js";
import { simCognitoSecretHash } from "./sim-cognito-secret-hash.js";

/**
 * What a test asks for when it wants a session it can renew.
 */
export interface SimCognitoRefreshableSessionInput {
  readonly poolName: string;
  readonly clientName: string;
  readonly username: string;
  readonly password: string;

  /**
   * The flows the app client allows. A rotating client is created without
   * `ALLOW_REFRESH_TOKEN_AUTH`, which is what `aws-cdk-lib` synthesizes.
   */
  readonly explicitAuthFlows: readonly string[];

  /**
   * Whether the app client is a confidential one, whose requests have to carry
   * its secret.
   */
  readonly generateSecret: boolean;

  /**
   * How long the refresh token lasts, in the app client's default unit of
   * days. Left out, it lasts the thirty days Cognito gives one.
   */
  readonly refreshTokenValidity: number | undefined;

  /**
   * Whether the app client rotates its refresh tokens, and for how long it
   * goes on honouring one it rotated out.
   */
  readonly refreshTokenRotation: SimCognitoRefreshTokenRotationType | undefined;
}

/**
 * A pool, an app client, and a signed-in user holding a refresh token.
 */
export interface SimCognitoRefreshableSession {
  readonly userPoolId: string;
  readonly clientId: string;

  /**
   * The app client's secret, which only a client created with one has.
   */
  readonly clientSecret: string | undefined;
  readonly username: string;
  readonly refreshToken: string;
}

/**
 * Signs a user in through a client-side sign-in and hands back the refresh
 * token it was given.
 *
 * Four commands stand between a test and a refresh token, and a test about
 * renewing a session is about none of them.
 *
 * ```typescript
 * const session = await simCognitoRefreshableSessionFactory.make(
 *   { refreshTokenRotation: { Feature: "ENABLED" } },
 *   simAws,
 * );
 * ```
 */
export const simCognitoRefreshableSessionFactory = new AsyncMappedFactory<
  SimCognitoRefreshableSessionInput,
  SimCognitoRefreshableSession,
  SimAws
>(
  () => ({
    poolName: "myapp-users",
    clientName: "web",
    username: "ada",
    password: "Correct-horse-1",
    explicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    generateSecret: false,
    refreshTokenValidity: undefined,
    refreshTokenRotation: undefined,
  }),
  async (input, simAws) => {
    const cognito = simAws.cognitoIdentityProvider();

    const pool = await cognito.createUserPool({
      input: { PoolName: input.poolName },
    });
    const userPoolId = pool.UserPool?.Id;
    assertDefined(userPoolId, "the created sim Cognito user pool id");

    const appClient = await cognito.createUserPoolClient({
      input: {
        UserPoolId: userPoolId,
        ClientName: input.clientName,
        ExplicitAuthFlows: input.explicitAuthFlows,
        GenerateSecret: input.generateSecret,
        RefreshTokenValidity: input.refreshTokenValidity,
        RefreshTokenRotation: input.refreshTokenRotation,
      },
    });
    const clientId = appClient.UserPoolClient?.ClientId;
    assertDefined(clientId, "the created sim Cognito app client id");

    await cognito.adminCreateUser({
      input: { UserPoolId: userPoolId, Username: input.username },
    });
    await cognito.adminSetUserPassword({
      input: {
        UserPoolId: userPoolId,
        Username: input.username,
        Password: input.password,
        Permanent: true,
      },
    });

    const signedIn = await cognito.initiateAuth({
      input: {
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: input.username,
          PASSWORD: input.password,
          ...(appClient.UserPoolClient?.ClientSecret !== undefined && {
            SECRET_HASH: simCognitoSecretHash(
              input.username,
              clientId,
              appClient.UserPoolClient.ClientSecret,
            ),
          }),
        },
      },
    });
    const refreshToken = signedIn.AuthenticationResult?.RefreshToken;
    assertDefined(refreshToken, "the issued sim Cognito refresh token");

    return {
      userPoolId,
      clientId,
      clientSecret: appClient.UserPoolClient?.ClientSecret,
      username: input.username,
      refreshToken,
    };
  },
);
