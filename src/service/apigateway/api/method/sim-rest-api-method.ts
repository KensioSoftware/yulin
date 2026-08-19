import type { SimRestApiIntegration } from "./sim-rest-api-integration.js";
import type { SimRestApiIntegrationView } from "./sim-rest-api-integration.js";

/**
 * The method matching any HTTP method the client used, where no method of that
 * name is declared on the resource.
 */
export const simRestApiAnyMethod = "ANY";

/**
 * The only authorization type simulated so far. Authorizers are a separate
 * piece of work, and a method asking for one is refused rather than served
 * open, which would let a test pass on a request real AWS would reject.
 */
export type SimRestApiAuthorizationType = "NONE";

interface SimRestApiMethodProperties {
  readonly httpMethod: string;
  readonly authorizationType: SimRestApiAuthorizationType;
  readonly apiKeyRequired: boolean;
  readonly operationName?: string | undefined;
}

/**
 * Minimal structural method view, as the Put and Get commands return.
 */
export interface SimRestApiMethodView {
  httpMethod: string;
  authorizationType: SimRestApiAuthorizationType;
  apiKeyRequired: boolean;
  operationName?: string;
  methodIntegration?: SimRestApiIntegrationView;
}

/**
 * A simulated REST API method: one HTTP method declared on one resource.
 *
 * The integration sits on the method rather than beside it, which is how the
 * REST API models it. `PutIntegration` addresses a resource and an HTTP
 * method, and `GetMethod` hands the integration back under `methodIntegration`.
 */
export class SimRestApiMethod {
  public readonly httpMethod: string;
  public readonly authorizationType: SimRestApiAuthorizationType;
  public readonly apiKeyRequired: boolean;
  public readonly operationName?: string | undefined;

  /**
   * What this method does with a request. A method with none declared is a
   * method real API Gateway answers 500 for, and it is what `PutMethod`
   * leaves behind until `PutIntegration` follows it.
   */
  public integration: SimRestApiIntegration | undefined;

  constructor(properties: SimRestApiMethodProperties) {
    this.httpMethod = properties.httpMethod;
    this.authorizationType = properties.authorizationType;
    this.apiKeyRequired = properties.apiKeyRequired;
    this.operationName = properties.operationName;
  }

  /**
   * Get the AWS-like view of this method.
   */
  view(): SimRestApiMethodView {
    const view: SimRestApiMethodView = {
      httpMethod: this.httpMethod,
      authorizationType: this.authorizationType,
      apiKeyRequired: this.apiKeyRequired,
    };

    if (this.operationName !== undefined) {
      view.operationName = this.operationName;
    }

    if (this.integration !== undefined) {
      view.methodIntegration = this.integration.view();
    }

    return view;
  }
}
