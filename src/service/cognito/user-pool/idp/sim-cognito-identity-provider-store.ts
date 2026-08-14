import {
  SimCognitoDuplicateProviderException,
  SimCognitoResourceNotFoundException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolIdentityProvider } from "./sim-cognito-user-pool-identity-provider.js";

/**
 * The external identity providers of one simulated user pool.
 *
 * Providers are keyed by name, which is what every provider operation names
 * one by and what an authorize request carries in `identity_provider`. A name
 * is unique within its pool, as it is on real Cognito.
 */
export class SimCognitoIdentityProviderStore {
  private readonly providers = new Map<
    string,
    SimCognitoUserPoolIdentityProvider
  >();

  /**
   * Every provider in this pool, in creation order.
   */
  get all(): readonly SimCognitoUserPoolIdentityProvider[] {
    return this.providers.values().toArray();
  }

  /**
   * Store a newly created provider, refusing a name the pool already holds.
   *
   * Real Cognito reports the second provider of one name as a duplicate
   * request rather than as a bad parameter, and says which name it was.
   */
  add(provider: SimCognitoUserPoolIdentityProvider): void {
    if (this.providers.has(provider.name)) {
      throw new SimCognitoDuplicateProviderException(
        `A provider with the name ${provider.name} already exists in the pool.`,
      );
    }

    this.providers.set(provider.name, provider);
  }

  /**
   * Forget a deleted provider.
   */
  remove(provider: SimCognitoUserPoolIdentityProvider): void {
    this.providers.delete(provider.name);
  }

  /**
   * Find a provider by name.
   */
  find(providerName: string): SimCognitoUserPoolIdentityProvider | undefined {
    return this.providers.get(providerName);
  }

  /**
   * Find a provider by one of the alternative names it was given.
   */
  findByIdentifier(
    identifier: string,
  ): SimCognitoUserPoolIdentityProvider | undefined {
    return this.all.find((provider) => provider.hasIdpIdentifier(identifier));
  }

  /**
   * Resolve a provider by name, or refuse.
   */
  require(providerName: string): SimCognitoUserPoolIdentityProvider {
    const found = this.find(providerName);

    if (found === undefined) {
      throw new SimCognitoResourceNotFoundException(
        `Identity provider ${providerName} does not exist.`,
      );
    }

    return found;
  }
}
