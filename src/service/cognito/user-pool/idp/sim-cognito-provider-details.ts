import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoProviderType } from "./sim-cognito-provider-type.js";

/**
 * Either of the two ways a SAML provider carries its metadata.
 */
const samlMetadataKeys = ["MetadataURL", "MetadataFile"];

/**
 * How a provider is configured, as a request sets it and a described provider
 * reports it.
 */
export type SimCognitoProviderDetailsType = Readonly<Record<string, string>>;

/**
 * The configuration of one external identity provider.
 *
 * The values are recorded and never used: a simulated sign-in reaches the
 * provider this simulation holds rather than the one at the other end of a
 * client id and secret. They are checked for presence all the same, so that a
 * provider which could not have been created on real AWS is not created here.
 */
export class SimCognitoProviderDetails {
  private readonly details: ReadonlyMap<string, string>;

  constructor(
    providerType: SimCognitoProviderType,
    details: SimCognitoProviderDetailsType | undefined,
  ) {
    this.details = new Map(Object.entries(details ?? {}));
    this.requireDetailsFor(providerType);
  }

  /**
   * These details as a described provider reports them.
   */
  toOutput(): SimCognitoProviderDetailsType {
    return Object.fromEntries(this.details);
  }

  /**
   * One configured value, if the provider was created with it.
   */
  value(key: string): string | undefined {
    return this.details.get(key);
  }

  private requireDetailsFor(providerType: SimCognitoProviderType): void {
    if (providerType.isSaml) {
      this.requireSamlMetadata(providerType);
      return;
    }

    const missing = providerType.requiredDetails.filter(
      (key) => !this.details.has(key),
    );

    if (missing.length > 0) {
      throw new SimCognitoInvalidParameterException(
        `ProviderDetails is missing ${missing.join(", ")}: a ` +
          `${providerType.value} provider is configured with ` +
          `${providerType.requiredDetails.join(", ")}.`,
      );
    }
  }

  private requireSamlMetadata(providerType: SimCognitoProviderType): void {
    const named = samlMetadataKeys.filter((key) => this.details.has(key));

    if (named.length === 0) {
      throw new SimCognitoInvalidParameterException(
        `ProviderDetails is missing ${samlMetadataKeys.join(" or ")}: a ` +
          `${providerType.value} provider is configured with one of them`,
      );
    }
  }
}
