/**
 * A user of the pool's own, for the hosted domain suites that sign one in
 * beside the federated users.
 *
 * It is apart from `federation-fixture.ts` because the pool, the domain and the
 * provider are one arrangement and this is another, and because that file is at
 * the length the linter allows.
 */

import type { AttributeType } from "@aws-sdk/client-cognito-identity-provider";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import type { SimCognitoHostedSetUp } from "./federation-fixture.js";

/**
 * The username the pool's own user in these tests holds.
 */
export const simCognitoLocalUsername = "alice";

/**
 * The password that user signs in with.
 */
export const simCognitoLocalPassword = "Sup3rSecret!";

export interface SimCognitoLocalUserOptions {
  /** The username the user holds, `alice` by default. */
  readonly username?: string;

  /** The password it signs in with. */
  readonly password?: string;

  /** The attributes it is created with, an email address by default. */
  readonly attributes?: AttributeType[];
}

/**
 * A confirmed user of the pool's own, holding a password it signs in with.
 *
 * An admin creates it and sets a permanent password on it, which is the
 * shortest route to a user in `CONFIRMED`. The sign-up route to the same place
 * is what the sign-up tests drive.
 */
export async function simCognitoLocalUser(
  setUp: SimCognitoHostedSetUp,
  options: SimCognitoLocalUserOptions = {},
): Promise<void> {
  const {
    username = simCognitoLocalUsername,
    password = simCognitoLocalPassword,
    attributes = [{ Name: "email", Value: `${username}@example.com` }],
  } = options;

  await setUp.cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: setUp.userPoolId,
      Username: username,
      UserAttributes: attributes,
    }),
  );
  await setUp.cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: setUp.userPoolId,
      Username: username,
      Password: password,
      Permanent: true,
    }),
  );
}
