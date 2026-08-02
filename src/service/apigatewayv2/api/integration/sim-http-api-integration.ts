import { faker } from "@faker-js/faker";

import type { Brand } from "../../../../util/brand.type.js";
import type { SimHttpApiLambdaUri } from "./sim-http-api-lambda-uri.js";

/**
 * The id API Gateway allocates for one integration.
 */
export type SimHttpApiIntegrationId = Brand<string, "SimHttpApiIntegrationId">;

/**
 * The only integration type simulated: a Lambda proxy integration.
 */
export type SimHttpApiIntegrationType = "AWS_PROXY";

/**
 * The only payload format simulated. Format 1.0 is refused rather than quietly
 * treated as 2.0, because a handler written for 1.0 reads event fields a 2.0
 * event does not have.
 */
export type SimHttpApiPayloadFormatVersion = "2.0";

/**
 * Allocate an integration id.
 *
 * Real API Gateway ids are opaque short lowercase alphanumeric strings; the
 * exact length is not part of the API contract, so only the shape is matched.
 */
export function makeSimHttpApiIntegrationId(): SimHttpApiIntegrationId {
  return faker.helpers.fromRegExp(/[a-z0-9]{8}/) as SimHttpApiIntegrationId;
}

interface SimHttpApiIntegrationProperties {
  readonly integrationId: SimHttpApiIntegrationId;
  readonly integrationType: SimHttpApiIntegrationType;
  readonly lambdaUri: SimHttpApiLambdaUri;
  readonly payloadFormatVersion: SimHttpApiPayloadFormatVersion;
  readonly description?: string | undefined;
}

/**
 * Minimal structural integration view, as the Create and Get commands return.
 */
export interface SimHttpApiIntegrationView {
  IntegrationId: string;
  IntegrationType: SimHttpApiIntegrationType;
  IntegrationUri: string;
  PayloadFormatVersion: SimHttpApiPayloadFormatVersion;
  Description?: string;
}

/**
 * A simulated HTTP API integration: what the API does with a request one of
 * its routes matched.
 *
 * Only `AWS_PROXY` is modelled, so an integration is a Lambda function and the
 * payload format that function is invoked with.
 */
export class SimHttpApiIntegration {
  public readonly integrationId: SimHttpApiIntegrationId;
  public readonly integrationType: SimHttpApiIntegrationType;
  public readonly lambdaUri: SimHttpApiLambdaUri;
  public readonly payloadFormatVersion: SimHttpApiPayloadFormatVersion;
  public readonly description?: string | undefined;

  constructor(properties: SimHttpApiIntegrationProperties) {
    this.integrationId = properties.integrationId;
    this.integrationType = properties.integrationType;
    this.lambdaUri = properties.lambdaUri;
    this.payloadFormatVersion = properties.payloadFormatVersion;
    this.description = properties.description;
  }

  /**
   * The ARN of the Lambda function this integration invokes, as the request
   * gave it and the API hands it back.
   */
  get integrationUri(): string {
    return this.lambdaUri.uri;
  }

  /**
   * Get the AWS-like view of this integration.
   */
  view(): SimHttpApiIntegrationView {
    const view: SimHttpApiIntegrationView = {
      IntegrationId: this.integrationId,
      IntegrationType: this.integrationType,
      IntegrationUri: this.integrationUri,
      PayloadFormatVersion: this.payloadFormatVersion,
    };

    if (this.description !== undefined) {
      view.Description = this.description;
    }

    return view;
  }
}
