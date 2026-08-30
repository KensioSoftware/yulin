import { SimCognitoNotAuthorizedException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolId } from "../sim-cognito-user-pool-id.js";
import type { SimCognitoAttributeMapping } from "./sim-cognito-attribute-mapping.js";
import {
  SimCognitoExternalUser,
  type SimCognitoExternalUserType,
} from "./sim-cognito-external-user.js";
import type { SimCognitoIdentityProviderSettings } from "./sim-cognito-identity-provider-settings.js";
import type { SimCognitoProviderDetails } from "./sim-cognito-provider-details.js";
import type { SimCognitoProviderType } from "./sim-cognito-provider-type.js";

interface SimCognitoUserPoolIdentityProviderProperties {
  readonly userPoolId: SimCognitoUserPoolId;
  readonly settings: SimCognitoIdentityProviderSettings;
  readonly createdAt: Date;
}

/**
 * One external identity provider configured on a simulated user pool.
 *
 * On real Cognito this holds the credentials the pool signs users in with at
 * Google, or the metadata of a SAML directory. Nothing here calls either, so
 * what it holds instead is the user signed in at the provider: a test puts one
 * there, and an authorize request naming this provider signs that user in.
 *
 * The configuration is still recorded and validated, so a provider that could
 * not have been created on real AWS is not created here, and a described
 * provider reports what the request set.
 */
export class SimCognitoUserPoolIdentityProvider {
  public readonly userPoolId: SimCognitoUserPoolId;
  public readonly creationDate: Date;

  private settings: SimCognitoIdentityProviderSettings;
  private modifiedDate: Date;
  private externalUser: SimCognitoExternalUser | undefined;

  constructor(properties: SimCognitoUserPoolIdentityProviderProperties) {
    this.userPoolId = properties.userPoolId;
    this.settings = properties.settings;
    this.creationDate = properties.createdAt;
    this.modifiedDate = properties.createdAt;
  }

  /** The name this provider is known by in the pool. */
  get name(): string {
    return this.settings.name;
  }

  /** The kind of external directory this provider stands for. */
  get type(): SimCognitoProviderType {
    return this.settings.type;
  }

  /** How the provider is configured. */
  get details(): SimCognitoProviderDetails {
    return this.settings.details;
  }

  /** What the provider's claims become on the pool user. */
  get attributeMapping(): SimCognitoAttributeMapping {
    return this.settings.attributeMapping;
  }

  /** The alternative names an authorize request can reach this provider by. */
  get idpIdentifiers(): readonly string[] {
    return this.settings.idpIdentifiers;
  }

  /** When the provider's settings last changed. */
  get lastModifiedDate(): Date {
    return this.modifiedDate;
  }

  /**
   * The issuer a federated identity records for this provider, which only the
   * providers configured with one have.
   */
  get issuer(): string | undefined {
    return (
      this.details.value("oidc_issuer") ?? this.details.value("MetadataURL")
    );
  }

  /**
   * Whether an authorize request naming this identifier reaches this provider.
   *
   * Real Cognito takes an `idp_identifier` as an alternative to the provider
   * name, so that an application can send a user to the provider for their
   * email domain without knowing what it was called.
   */
  hasIdpIdentifier(identifier: string): boolean {
    return this.idpIdentifiers.includes(identifier);
  }

  /**
   * Replace this provider's settings, as `UpdateIdentityProvider` does.
   */
  update(settings: SimCognitoIdentityProviderSettings, at: Date): void {
    this.settings = settings;
    this.modifiedDate = at;
  }

  /**
   * Say who is signed in at this provider.
   *
   * This is the simulator's own accessor. It stands in for everything that
   * happens at the provider itself, which is where a real user types a
   * password this simulation never sees.
   */
  signInAs(externalUser: SimCognitoExternalUserType): void {
    this.externalUser = new SimCognitoExternalUser(externalUser);
  }

  /**
   * Sign out of this provider, so a further authorize request finds nobody.
   */
  signOut(): void {
    this.externalUser = undefined;
  }

  /**
   * The user signed in at this provider, where anything has put one there.
   *
   * A request that presents an external user of its own reads this first, to
   * find out whether it has to ask for one.
   */
  get signedInUser(): SimCognitoExternalUser | undefined {
    return this.externalUser;
  }

  /**
   * The user this provider signs in, or a refusal.
   *
   * Real Cognito would show the provider's own sign-in page here, and there is
   * no page in a simulation. Refusing is what stops an authorize request
   * quietly signing in a user nothing put there.
   */
  requireSignedInUser(): SimCognitoExternalUser {
    if (this.externalUser === undefined) {
      throw new SimCognitoNotAuthorizedException(
        `Nobody is signed in at the ${this.name} identity provider. Real ` +
          `Cognito would send the user to the provider's own sign-in page, ` +
          `which this simulation has no equivalent of. Say who is signed in ` +
          `there with signInAs first.`,
      );
    }

    return this.externalUser;
  }
}
