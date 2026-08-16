import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolSchema } from "../schema/sim-cognito-user-pool-schema.js";
import {
  SimCognitoAttributeMapping,
  type SimCognitoAttributeMappingType,
} from "./sim-cognito-attribute-mapping.js";
import {
  SimCognitoProviderDetails,
  type SimCognitoProviderDetailsType,
} from "./sim-cognito-provider-details.js";
import { SimCognitoProviderType } from "./sim-cognito-provider-type.js";

/**
 * How long a provider name may be.
 */
const maxProviderNameLength = 32;

/**
 * The name a pool's own users sign in under, which no provider may take.
 */
const localProviderName = "COGNITO";

/**
 * The properties `CreateIdentityProvider` and `UpdateIdentityProvider` set.
 */
export interface SimCognitoIdentityProviderSettingsInput {
  readonly ProviderName?: string | undefined;
  readonly ProviderType?: string | undefined;
  readonly ProviderDetails?: SimCognitoProviderDetailsType | undefined;
  readonly AttributeMapping?: SimCognitoAttributeMappingType | undefined;
  readonly IdpIdentifiers?: readonly string[] | undefined;
}

/**
 * The settable properties of one identity provider.
 *
 * `CreateIdentityProvider` builds one of these from its request. The provider
 * name is among them although an update cannot change it, because the name is
 * what the update names the provider by and the settings are what hold it.
 *
 * The pool's schema comes in alongside the request because the attribute
 * mapping is checked against it: a claim can only be mapped onto an attribute
 * the pool holds.
 */
export class SimCognitoIdentityProviderSettings {
  public readonly name: string;
  public readonly type: SimCognitoProviderType;
  public readonly details: SimCognitoProviderDetails;
  public readonly attributeMapping: SimCognitoAttributeMapping;
  public readonly idpIdentifiers: readonly string[];

  constructor(
    input: SimCognitoIdentityProviderSettingsInput,
    schema: SimCognitoUserPoolSchema,
  ) {
    this.name = SimCognitoIdentityProviderSettings.requiredName(
      input.ProviderName,
    );
    this.type = new SimCognitoProviderType(input.ProviderType);
    this.details = new SimCognitoProviderDetails(
      this.type,
      input.ProviderDetails,
    );
    this.attributeMapping = new SimCognitoAttributeMapping(
      input.AttributeMapping,
      schema,
    );
    this.idpIdentifiers = [...(input.IdpIdentifiers ?? [])];
  }

  /**
   * Check the name a provider is known by in its pool.
   *
   * `COGNITO` is refused because it is the name the pool's own users already
   * sign in under, and a provider taking it would make an authorize request
   * ambiguous.
   */
  private static requiredName(value: string | undefined): string {
    if (value === undefined || value === "") {
      throw new SimCognitoInvalidParameterException(
        "ProviderName is required: name the provider being added to the pool",
      );
    }

    if (value.length > maxProviderNameLength) {
      throw new SimCognitoInvalidParameterException(
        `ProviderName '${value}' is too long: a provider name is at most ` +
          `${String(maxProviderNameLength)} characters`,
      );
    }

    if (value === localProviderName) {
      throw new SimCognitoInvalidParameterException(
        `ProviderName '${localProviderName}' is reserved: it is the name the ` +
          `pool's own users sign in under`,
      );
    }

    return value;
  }
}
