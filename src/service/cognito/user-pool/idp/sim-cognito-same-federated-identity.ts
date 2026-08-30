import { SimCognitoUsernameExistsException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";
import type { SimCognitoExternalUser } from "./sim-cognito-external-user.js";
import type { SimCognitoUserPoolIdentityProvider } from "./sim-cognito-user-pool-identity-provider.js";

/**
 * Refuse a federated sign-in that would take over a user it did not create.
 *
 * A username is only reserved by being taken, and a pool's own user may validly
 * be called `Google_1234`, so the user found by name is the federated one only
 * when its identity says so. Signing in as it otherwise would hand an
 * application a token for someone else's account, which is worth refusing
 * rather than guessing at.
 */
export function requireSimCognitoSameFederatedIdentity(
  existing: SimCognitoUser,
  provider: SimCognitoUserPoolIdentityProvider,
  externalUser: SimCognitoExternalUser,
): void {
  const { identity } = existing;

  if (
    identity?.providerName !== provider.name ||
    identity.userId !== externalUser.subject
  ) {
    throw new SimCognitoUsernameExistsException(
      `User ${existing.username} already exists in user pool ` +
        `${provider.userPoolId} and is not the ${provider.name} user this ` +
        `sign-in is for.`,
    );
  }
}
