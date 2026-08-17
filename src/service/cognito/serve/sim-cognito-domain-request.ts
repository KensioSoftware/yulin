import type { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";

/**
 * One request to a hosted domain, and what answers it.
 */
export interface SimCognitoDomainRequest {
  readonly pool: SimCognitoUserPool;

  /** The simulated Cognito scope the pool belongs to. */
  readonly cognito: SimCognitoIdentityProvider;
  readonly serviceRequest: SimAwsServiceRequest;
  readonly url: URL;
}
