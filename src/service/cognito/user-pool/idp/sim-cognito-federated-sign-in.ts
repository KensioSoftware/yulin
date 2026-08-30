import { requireSimCognitoEnabled } from "../auth/sim-cognito-sign-in.js";
import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import type { SimCognitoUserPoolTriggers } from "../trigger/sim-cognito-user-pool-triggers.js";
import type { SimCognitoUser } from "../user/sim-cognito-user.js";
import type { SimCognitoAttributeType } from "../user/sim-cognito-user-attributes.js";
import type { SimCognitoUserFactory } from "../user/sim-cognito-user-factory.js";
import {
  requireSimCognitoUsername,
  type SimCognitoUsername,
} from "../user/sim-cognito-username.js";
import { SimCognitoFederatedIdentity } from "./sim-cognito-federated-identity.js";
import { SimCognitoFederatedTriggers } from "./sim-cognito-federated-triggers.js";
import { requireSimCognitoSameFederatedIdentity } from "./sim-cognito-same-federated-identity.js";
import type { SimCognitoUserPoolIdentityProvider } from "./sim-cognito-user-pool-identity-provider.js";

interface SimCognitoFederatedSignInProperties {
  readonly userFactory: SimCognitoUserFactory;
  readonly triggers: SimCognitoUserPoolTriggers;
}

interface SimCognitoFederatedSignInRequest {
  readonly pool: SimCognitoUserPool;
  readonly client: SimCognitoUserPoolClient;
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
 *
 * Which triggers fire depends on whether the pool has met this subject before.
 * A first sign-in is a sign-up, and runs `PreSignUp` and `PostConfirmation`.
 * Every sign-in after it is an authentication, and runs `PreAuthentication`
 * and `PostAuthentication`. That is the split AWS documents for federated
 * users, and it means a handler creating a profile record on first sight of a
 * user runs once for a Google user rather than on every visit.
 */
export class SimCognitoFederatedSignIn {
  private readonly userFactory: SimCognitoUserFactory;
  private readonly triggers: SimCognitoFederatedTriggers;

  constructor(properties: SimCognitoFederatedSignInProperties) {
    this.userFactory = properties.userFactory;
    this.triggers = new SimCognitoFederatedTriggers({
      triggers: properties.triggers,
    });
  }

  /**
   * Sign the user signed in at the provider in to the pool.
   */
  async signIn(
    request: SimCognitoFederatedSignInRequest,
  ): Promise<SimCognitoUser> {
    const { pool, provider } = request;
    const externalUser = provider.requireSignedInUser();
    const username = requireSimCognitoUsername(
      `${provider.name}_${externalUser.subject}`,
    );
    const attributes = provider.attributeMapping.attributesFor(externalUser);
    const existing = pool.findUser(username);

    if (existing !== undefined) {
      requireSimCognitoSameFederatedIdentity(existing, provider);

      return this.returningUser(request, existing, attributes);
    }

    return this.newUser(request, username, attributes);
  }

  /**
   * Sign in a subject the pool already holds a user for.
   *
   * `PreAuthentication` runs before the mapped attributes are brought up to
   * date, so a handler that refuses the sign-in leaves the user as it was.
   *
   * A disabled user is refused after that trigger and not before it, which is
   * the order the API sign-ins use: real Cognito hands the trigger the user to
   * decide about, and a sign-in the pool is going to refuse reaches it too.
   */
  private async returningUser(
    request: SimCognitoFederatedSignInRequest,
    user: SimCognitoUser,
    attributes: readonly SimCognitoAttributeType[],
  ): Promise<SimCognitoUser> {
    const { pool, client } = request;

    await this.triggers.beforeSignIn({ pool, client, user });

    requireSimCognitoEnabled(user);

    user.updateAttributes(attributes);

    await this.triggers.afterSignIn({ pool, client, user });

    return user;
  }

  /**
   * Build and sign in the pool's user for a subject it has never seen.
   *
   * The order is the sign-up's order. `PreSignUp` runs on a user that is not
   * in the pool yet, so a handler that throws leaves the pool without it, and
   * `PostConfirmation` runs on the user the pool now holds.
   *
   * `autoConfirmUser` has nothing to do here. A federated user is created in
   * `EXTERNAL_PROVIDER` and never passes through `UNCONFIRMED`, so there is no
   * confirmation for a handler to skip. `autoVerifyEmail` and `autoVerifyPhone`
   * are applied, as they are for a sign-up.
   */
  private async newUser(
    request: SimCognitoFederatedSignInRequest,
    username: SimCognitoUsername,
    attributes: readonly SimCognitoAttributeType[],
  ): Promise<SimCognitoUser> {
    const { pool, client, provider, now } = request;
    const externalUser = provider.requireSignedInUser();

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

    const preSignUp = await this.triggers.beforeSignUp({ pool, client, user });

    preSignUp.verifyAttributesOf(user);
    pool.addUser(user);

    await this.triggers.afterSignUp({ pool, client, user });

    return user;
  }
}
