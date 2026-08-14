import { SimCognitoOAuthError } from "../../error/sim-cognito-oauth.error.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";

/**
 * What scopes a hosted sign-in was granted.
 *
 * A request asking for nothing is granted everything its app client allows,
 * which is what real Cognito does. A request asking for a scope its client
 * does not allow is refused rather than quietly granted less than it asked
 * for, because an application holding a token without the scope it asked for
 * fails later and further away.
 */
export class SimCognitoGrantedScopes {
  public readonly values: readonly string[];

  constructor(client: SimCognitoUserPoolClient, requested: string | undefined) {
    this.values = SimCognitoGrantedScopes.granted(client, requested);
  }

  private static granted(
    client: SimCognitoUserPoolClient,
    requested: string | undefined,
  ): readonly string[] {
    if (requested === undefined || requested === "") {
      return client.oauth.scopes;
    }

    const asked = requested.split(" ").filter((scope) => scope !== "");

    for (const scope of asked) {
      if (!client.oauth.scopes.includes(scope)) {
        throw new SimCognitoOAuthError({
          code: "invalid_scope",
          description:
            `scope '${scope}' is not one of app client ${client.id}'s ` +
            `AllowedOAuthScopes`,
          redirectable: true,
        });
      }
    }

    return asked;
  }
}
