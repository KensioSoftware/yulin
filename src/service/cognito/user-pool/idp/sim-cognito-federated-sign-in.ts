import { SimCognitoUsernameExistsException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";
import type { SimCognitoUserFactory } from "../user/sim-cognito-user-factory.js";
import { requireSimCognitoUsername } from "../user/sim-cognito-username.js";
import { SimCognitoFederatedIdentity } from "./sim-cognito-federated-identity.js";
import type { SimCognitoUserPoolIdentityProvider } from "./sim-cognito-user-pool-identity-provider.js";

interface SimCognitoFederatedSignInProperties {
  readonly userFactory: SimCognitoUserFactory;
}

interface SimCognitoFederatedSignInRequest {
  readonly pool: SimCognitoUserPool;
  readonly provider: SimCognitoUserPoolIdentityProvider;
  readonly now: Date;
}

/**
 * Signs an external user in to a pool, creating the pool's own user for it the
 * first time.
 *
 * Cognito keeps a user of its own for every external subject that signs in,
 * because everything downstream of the sign-in works on pool users: the tokens
 * name one, groups hold one, and the pool's own operations describe one. The
 * username it builds is the provider name and the subject with an underscore
 * between them, which is what makes the same subject signing in twice reach
 * the same user rather than a second one.
 *
 * The provider's claims reach the user through the provider's attribute
 * mapping, on every sign-in rather than only the first, because real Cognito
 * updates a mapped attribute when the value at the provider changes.
 */
export class SimCognitoFederatedSignIn {
  private readonly userFactory: SimCognitoUserFactory;

  constructor(properties: SimCognitoFederatedSignInProperties) {
    this.userFactory = properties.userFactory;
  }

  /**
   * Refuse a sign-in that would take over a user it did not create.
   *
   * A username is only reserved by being taken, and a pool's own user may
   * validly be called `Google_1234`, so the user found by name is only the
   * federated one when its identity says so. Signing in as it otherwise would
   * hand an application a token for someone else's account, which is worth
   * refusing rather than guessing at.
   */
  private static requireSameIdentity(
    existing: SimCognitoUser,
    provider: SimCognitoUserPoolIdentityProvider,
  ): void {
    const { identity } = existing;
    const externalUser = provider.requireSignedInUser();

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

  /**
   * Sign the user signed in at the provider in to the pool.
   */
  signIn(request: SimCognitoFederatedSignInRequest): SimCognitoUser {
    const { pool, provider, now } = request;
    const externalUser = provider.requireSignedInUser();
    const username = requireSimCognitoUsername(
      `${provider.name}_${externalUser.subject}`,
    );
    const attributes = provider.attributeMapping.attributesFor(externalUser);
    const existing = pool.findUser(username);

    if (existing !== undefined) {
      SimCognitoFederatedSignIn.requireSameIdentity(existing, provider);
      existing.updateAttributes(attributes);

      return existing;
    }

    const user = this.userFactory.federated({
      username,
      attributes,
      schema: pool.settings.schema,
      identity: new SimCognitoFederatedIdentity({
        userId: externalUser.subject,
        providerName: provider.name,
        providerType: provider.type.value,
        issuer: provider.issuer,
        createdAt: now,
      }),
    });

    pool.addUser(user);

    return user;
  }
}
