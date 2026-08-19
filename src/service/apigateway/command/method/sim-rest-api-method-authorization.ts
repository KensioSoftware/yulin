import type { SimRestApiAuthorizationType } from "../../api/method/sim-rest-api-method.js";
import { SimRestApiMethodScopes } from "../../api/method/sim-rest-api-method-scopes.js";
import type { SimRestApiResource } from "../../api/resource/sim-rest-api-resource.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import type { SimPutMethodCommandInput } from "./method.command.js";
import { SimRestApiMethodAuthorizationOptions } from "./sim-rest-api-method-authorization-options.js";
import { simRestApiMethodAuthorizationType } from "./sim-rest-api-method-authorization-type.js";
import {
  simRestApiCognitoAuthorizationType,
  SimRestApiMethodAuthorizerInput,
} from "./sim-rest-api-method-authorizer-input.js";

/**
 * What a method's authorization type, authorizer id and scopes come to.
 */
export interface SimRestApiMethodAuthorization {
  readonly authorizationType: SimRestApiAuthorizationType;
  readonly authorizerId?: string | undefined;
  readonly authorizationScopes: SimRestApiMethodScopes;
}

interface SimRestApiMethodAuthorizationInputProperties {
  readonly input: SimPutMethodCommandInput;
  readonly restApi: SimRestApi;
  readonly resource: SimRestApiResource;
  readonly httpMethod: string;
}

/**
 * Reads the authorization a `PutMethod` input asks for.
 *
 * A method is open, decided by IAM, or it names one of the API's authorizers.
 * Every other pairing is refused, because a method that looked gated to the
 * caller that declared it and answered every request here is worse than a
 * refused command.
 *
 * Which options each type has a use for is
 * `SimRestApiMethodAuthorizationOptions`, and finding the authorizer named is
 * `SimRestApiMethodAuthorizerInput`, so what is left here is which of the four
 * a method asked for.
 */
export class SimRestApiMethodAuthorizationInput {
  private readonly properties: SimRestApiMethodAuthorizationInputProperties;
  private readonly options: SimRestApiMethodAuthorizationOptions;

  constructor(properties: SimRestApiMethodAuthorizationInputProperties) {
    this.properties = properties;
    this.options = new SimRestApiMethodAuthorizationOptions(properties);
  }

  /**
   * The authorization this method is declared with, refusing a type nothing
   * enforces, an authorizer the API has not got and scopes nothing checks.
   */
  read(): SimRestApiMethodAuthorization {
    const { input } = this.properties;
    const authorizationType = simRestApiMethodAuthorizationType(
      input.authorizationType,
    );

    if (authorizationType === simRestApiCognitoAuthorizationType) {
      // The one type the scopes apply to, since they are checked against the
      // token it verifies.
      return this.gated(authorizationType, input.authorizationScopes ?? []);
    }

    this.options.refuseScopes(authorizationType);

    if (authorizationType === "CUSTOM") {
      return this.gated(authorizationType, []);
    }

    this.options.refuseAuthorizerId(authorizationType);

    return {
      authorizationType,
      authorizationScopes: new SimRestApiMethodScopes(),
    };
  }

  /**
   * A method that sends its requests through one of the API's authorizers.
   */
  private gated(
    authorizationType: SimRestApiAuthorizationType,
    scopes: readonly string[],
  ): SimRestApiMethodAuthorization {
    return {
      authorizationType,
      authorizerId: new SimRestApiMethodAuthorizerInput(this.properties).read(
        this.properties.input.authorizerId,
        authorizationType,
      ),
      authorizationScopes: new SimRestApiMethodScopes(scopes),
    };
  }
}
