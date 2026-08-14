import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * A user as an external provider would hand it back, in the shape a test puts
 * one there.
 */
export interface SimCognitoExternalUserType {
  /**
   * The provider's own identifier for the user, which is the `sub` of a social
   * or OIDC provider and the name id of a SAML one. It is what the pool builds
   * the federated username from, so the same subject signing in twice reaches
   * the same pool user.
   */
  readonly Subject: string | undefined;

  /**
   * The claims the provider would return about the user. The provider's own
   * claim names are used, and the identity provider's attribute mapping is
   * what turns them into pool attributes.
   */
  readonly Claims?: Readonly<Record<string, string>> | undefined;
}

/**
 * The user signed in at a simulated external identity provider.
 *
 * Nothing here calls Google or reads a SAML assertion, so the provider has to
 * be told who is signed in at it. That is what this is: the answer the
 * provider gives when a browser is redirected to it, put there by the test
 * rather than by a user typing a password into someone else's login page.
 */
export class SimCognitoExternalUser {
  public readonly subject: string;
  private readonly claims: ReadonlyMap<string, string>;

  constructor(externalUser: SimCognitoExternalUserType) {
    if (externalUser.Subject === undefined || externalUser.Subject === "") {
      throw new SimCognitoInvalidParameterException(
        "An external user needs a Subject: it is what the provider " +
          "identifies the user by, and what the pool builds its username from",
      );
    }

    this.subject = externalUser.Subject;
    this.claims = new Map(Object.entries(externalUser.Claims ?? {}));
  }

  /**
   * One claim this user carries, if the provider would return it.
   */
  claim(name: string): string | undefined {
    return this.claims.get(name);
  }
}
