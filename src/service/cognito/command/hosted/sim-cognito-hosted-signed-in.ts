import type { SimCognitoUser } from "../../user-pool/user/sim-cognito-user.js";
import type { SimCognitoSessionChange } from "./sim-cognito-session-change.js";

interface SimCognitoHostedSignedInProperties {
  readonly user: SimCognitoUser;
  readonly session: SimCognitoSessionChange;
}

/**
 * Who an authorize request signed in, and what it did to the browser's managed
 * login session on the way.
 *
 * The two travel together because the endpoint needs both: the user is who the
 * authorization code is issued for, and the session change is what the
 * response tells the browser to hold.
 */
export class SimCognitoHostedSignedIn {
  public readonly user: SimCognitoUser;
  public readonly session: SimCognitoSessionChange;

  constructor(properties: SimCognitoHostedSignedInProperties) {
    this.user = properties.user;
    this.session = properties.session;
  }
}
