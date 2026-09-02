import {
  simCognitoClaimFieldPrefix,
  simCognitoDefaultClaim,
  simCognitoDefaultSubject,
  simCognitoMappedClaimNames,
} from "../../user-pool/idp/sim-cognito-presented-external-user.js";
import type { SimCognitoUserPoolIdentityProvider } from "../../user-pool/idp/sim-cognito-user-pool-identity-provider.js";
import {
  SimCognitoPageMarkup,
  type SimCognitoPageParameters,
} from "./sim-cognito-page-markup.js";
import { simCognitoAuthorizePath } from "./sim-cognito-page-paths.js";

/**
 * The page a browser reaches where real Cognito would have sent it to an
 * identity provider's own sign-in page.
 *
 * Nothing here calls Google, so there is no page to send anybody to and no
 * password for anybody to type. This stands in for that page: it asks who the
 * provider would have said is signing in, and the answer goes back to the
 * authorize endpoint as the subject and the claims a provider asserts. A test
 * says the same thing with `signInAs` and never sees this.
 *
 * It says whose page it is on its face, twice, because somebody meeting it in
 * a screenshot or a screen recording has to be able to tell at a glance that
 * no real sign-in happened here.
 */
export class SimCognitoProviderPage {
  private readonly markup = new SimCognitoPageMarkup();

  /**
   * The page asking who the provider is signing in.
   *
   * Every field arrives filled in, so the common case is pressing the button.
   * Editing the address is what drives a federated sign-up against a pool that
   * already holds a local user at the same address, which real Cognito keeps
   * as two accounts.
   */
  render(
    provider: SimCognitoUserPoolIdentityProvider,
    parameters: SimCognitoPageParameters,
  ): Response {
    const body =
      this.markup.message(
        `This is Yulin standing in for ${provider.name}. It is not ` +
          `${provider.name}, nobody has signed in there, and nothing on this ` +
          `page reaches it. Say who ${provider.name} would have said is ` +
          `signing in, and the pool signs that user in.`,
      ) +
      this.markup.form(
        simCognitoAuthorizePath,
        this.markup.hidden(parameters) +
          this.markup.field(
            "subject",
            `Subject, which ${provider.name} identifies the user by`,
            "text",
            simCognitoDefaultSubject(provider),
          ) +
          this.claimFields(provider) +
          this.markup.submit(
            "continue",
            `Continue as this ${provider.name} user`,
          ),
      );

    return this.markup.page(`Simulated ${provider.name} sign-in`, body);
  }

  /**
   * One field per claim the provider's attribute mapping reads.
   *
   * A claim the mapping says nothing about reaches no pool attribute, so
   * asking for one would be asking for something to throw away.
   */
  private claimFields(provider: SimCognitoUserPoolIdentityProvider): string {
    return simCognitoMappedClaimNames(provider)
      .map((claimName) =>
        this.markup.field(
          `${simCognitoClaimFieldPrefix}${claimName}`,
          `${claimName} claim`,
          "text",
          simCognitoDefaultClaim(provider, claimName),
        ),
      )
      .join("");
  }
}
