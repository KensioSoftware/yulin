import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type {
  SimCognitoPageMarkup,
  SimCognitoPageParameters,
} from "./sim-cognito-page-markup.js";
import { simCognitoAuthorizePath } from "./sim-cognito-page-paths.js";

/**
 * One link per identity provider this app client offers, each starting the
 * federated sign-in the authorize endpoint already answers.
 *
 * A provider the client left out of its `SupportedIdentityProviders` is left
 * off the page, because the authorize request the link would make is one that
 * endpoint refuses.
 */
export function simCognitoProviderLinks(
  markup: SimCognitoPageMarkup,
  pool: SimCognitoUserPool,
  parameters: SimCognitoPageParameters,
): string {
  const clientId = parameters["client_id"];
  const client = clientId === undefined ? undefined : pool.findClient(clientId);

  return pool.auth.identityProviders.all
    .filter(
      (provider) =>
        client?.oauth.allowsIdentityProvider(provider.name) ?? false,
    )
    .map((provider) =>
      markup.link(
        simCognitoAuthorizePath,
        { ...parameters, identity_provider: provider.name },
        `Sign in with ${provider.name}`,
      ),
    )
    .join("");
}
