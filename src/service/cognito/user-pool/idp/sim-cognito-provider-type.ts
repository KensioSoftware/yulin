import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * The details each kind of provider is configured with.
 *
 * Nothing here calls a provider, so none of these values is used. They are
 * required anyway, because a provider created without them is a request that
 * fails on the way to AWS, and a pool that accepted one here would send a user
 * to a provider that was never configured.
 */
const socialDetails = ["client_id", "client_secret", "authorize_scopes"];

const requiredDetails = new Map<string, readonly string[]>([
  ["Facebook", socialDetails],
  ["Google", socialDetails],
  ["LoginWithAmazon", socialDetails],
  [
    "SignInWithApple",
    ["client_id", "team_id", "key_id", "private_key", "authorize_scopes"],
  ],
  [
    "OIDC",
    [
      "client_id",
      "client_secret",
      "attributes_request_method",
      "oidc_issuer",
      "authorize_scopes",
    ],
  ],
  ["SAML", []],
]);

/**
 * The kind of external directory an identity provider stands for.
 *
 * The type decides what a provider has to be configured with, and nothing
 * else here: a simulated sign-in through a SAML provider and through Google
 * both end in the same thing, an external subject with claims that the pool
 * maps onto a user.
 */
export class SimCognitoProviderType {
  public readonly value: string;

  constructor(value: string | undefined) {
    if (value === undefined || value === "") {
      throw new SimCognitoInvalidParameterException(
        "ProviderType is required: name the kind of provider being added",
      );
    }

    if (!requiredDetails.has(value)) {
      throw new SimCognitoInvalidParameterException(
        `ProviderType '${value}' is not a provider type: the types are ` +
          `${requiredDetails.keys().toArray().join(", ")}.`,
      );
    }

    this.value = value;
  }

  /**
   * Whether this type carries assertions rather than an OAuth token.
   */
  get isSaml(): boolean {
    return this.value === "SAML";
  }

  /**
   * The provider details this type has to be configured with.
   *
   * A SAML provider is configured with a metadata document instead, which is
   * checked where the details are read rather than here.
   */
  get requiredDetails(): readonly string[] {
    return requiredDetails.get(this.value) ?? [];
  }
}
