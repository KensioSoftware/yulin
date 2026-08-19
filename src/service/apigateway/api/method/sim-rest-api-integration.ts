import type { SimRestApiLambdaUri } from "./sim-rest-api-lambda-uri.js";

/**
 * The only integration type simulated: a Lambda proxy integration.
 *
 * `MOCK`, `HTTP`, `HTTP_PROXY` and the non-proxy `AWS` type are refused rather
 * than treated as this one, because each of them answers a request from
 * somewhere else entirely.
 */
export type SimRestApiIntegrationType = "AWS_PROXY";

/**
 * The HTTP method API Gateway uses to call a Lambda integration. It is always
 * `POST`, whatever method the client used, because that is the method the
 * Lambda invoke API takes.
 */
export const simRestApiLambdaIntegrationHttpMethod = "POST";

interface SimRestApiIntegrationProperties {
  readonly integrationType: SimRestApiIntegrationType;
  readonly lambdaUri: SimRestApiLambdaUri;
  readonly integrationHttpMethod: string;
}

/**
 * Minimal structural integration view, as the Put and Get commands return.
 */
export interface SimRestApiIntegrationView {
  type: SimRestApiIntegrationType;
  httpMethod: string;
  uri: string;
}

/**
 * A simulated REST API integration: what the API does with a request one of
 * its methods matched.
 *
 * Only `AWS_PROXY` is modelled, so an integration is the Lambda function the
 * method invokes. An integration belongs to one method of one resource, unlike
 * an HTTP API integration, which is a resource of its own that several routes
 * can share.
 */
export class SimRestApiIntegration {
  public readonly integrationType: SimRestApiIntegrationType;
  public readonly lambdaUri: SimRestApiLambdaUri;
  public readonly integrationHttpMethod: string;

  constructor(properties: SimRestApiIntegrationProperties) {
    this.integrationType = properties.integrationType;
    this.lambdaUri = properties.lambdaUri;
    this.integrationHttpMethod = properties.integrationHttpMethod;
  }

  /**
   * Get the AWS-like view of this integration.
   */
  view(): SimRestApiIntegrationView {
    return {
      type: this.integrationType,
      httpMethod: this.integrationHttpMethod,
      uri: this.lambdaUri.uri,
    };
  }
}
