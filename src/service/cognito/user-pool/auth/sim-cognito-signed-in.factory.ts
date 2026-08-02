import { AsyncMappedFactory } from "@kensio/part-factory";

import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoJwks } from "../token/sim-cognito-signing-key.js";

/**
 * What a test asks for when it wants a user pool it can sign in against.
 */
export interface SimCognitoSignedInInput {
  readonly poolName: string;
  readonly clientName: string;
  readonly username: string;
  readonly password: string;
  /** Groups the user is put in, which reach the tokens as `cognito:groups`. */
  readonly groupNames: readonly string[];
}

/**
 * A pool, an app client, a signed-in user, and the tokens that sign-in issued.
 */
export interface SimCognitoSignedIn {
  readonly userPoolId: string;
  readonly clientId: string;
  readonly username: string;
  readonly accessToken: string;
  readonly idToken: string;
  /** The URL the issued tokens name as their issuer. */
  readonly issuerUrl: string;
  /** The keys the pool publishes, as its JWKS endpoint serves them. */
  readonly jwks: SimCognitoJwks;
}

/**
 * Creates a simulated user pool with one signed-in user, through the ordinary
 * commands.
 *
 * Five commands stand between a test and a real signed token, and a test about
 * verifying one is about none of them.
 *
 * ```typescript
 * const signedIn = await simCognitoSignedInFactory.make({}, simAws);
 * ```
 *
 * The pool is created in the default Account and Region of the simulated AWS
 * it is given.
 */
export const simCognitoSignedInFactory = new AsyncMappedFactory<
  SimCognitoSignedInInput,
  SimCognitoSignedIn,
  SimAws
>(
  () => ({
    poolName: "myapp-users",
    clientName: "web",
    username: "ada",
    password: "Correct-horse-1",
    groupNames: [],
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
        ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
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

    await Promise.all(
      input.groupNames.map(async (groupName) => {
        await cognito.createGroup({
          input: { UserPoolId: userPoolId, GroupName: groupName },
        });
        await cognito.adminAddUserToGroup({
          input: {
            UserPoolId: userPoolId,
            Username: input.username,
            GroupName: groupName,
          },
        });
      }),
    );

    const signedIn = await cognito.adminInitiateAuth({
      input: {
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: input.username,
          PASSWORD: input.password,
        },
      },
    });
    const accessToken = signedIn.AuthenticationResult?.AccessToken;
    const idToken = signedIn.AuthenticationResult?.IdToken;
    assertDefined(accessToken, "the issued sim Cognito access token");
    assertDefined(idToken, "the issued sim Cognito id token");

    const userPool = cognito.userPool(userPoolId);

    return {
      userPoolId,
      clientId,
      username: input.username,
      accessToken,
      idToken,
      issuerUrl: userPool.issuerUrl,
      jwks: userPool.jwks(),
    };
  },
);
