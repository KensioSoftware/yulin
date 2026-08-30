import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import type { SimCognitoSessionChange } from "./sim-cognito-session-change.js";

interface SimCognitoHostedSignedInProperties {
  readonly user: SimCognitoUser;
  readonly session: SimCognitoSessionChange;

  /**
   * Whether this request signed the user in at an identity provider.
   *
   * The tokens a federated sign-in hands out report a `PreTokenGeneration`
   * source of their own, and the code the endpoint issues is what carries the
   * answer as far as the token endpoint.
   */
  readonly federated?: boolean | undefined;
}

/**
 * Who an authorize request signed in, and what it did to the browser's managed
 * login session on the way.
 *
 * These travel together because the endpoint needs all of them. The user is
 * who the authorization code is issued for, the session change is what the
 * response tells the browser to hold, and the federated flag is what the code
 * remembers about how the sign-in happened.
 */
export class SimCognitoHostedSignedIn {
  public readonly user: SimCognitoUser;
  public readonly session: SimCognitoSessionChange;
  public readonly federated: boolean;

  constructor(properties: SimCognitoHostedSignedInProperties) {
    this.user = properties.user;
    this.session = properties.session;
    this.federated = properties.federated ?? false;
  }

  /**
   * The same sign-in, marked as having happened at an identity provider.
   *
   * The browser session is started the same way whichever way the user signed
   * in, so this is applied afterwards by the one path that federates.
   */
  asFederated(): SimCognitoHostedSignedIn {
    return new SimCognitoHostedSignedIn({
      user: this.user,
      session: this.session,
      federated: true,
    });
  }
}
