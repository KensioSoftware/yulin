import { randomUUID } from "node:crypto";

import type { Brand } from "../../../util/brand.type.js";
import type { SimCloudFrontResponseHeader } from "./sim-cf-response-header.js";

export type SimCloudFrontResponseHeadersPolicyId = Brand<
  string,
  "SimCloudFrontResponseHeadersPolicyId"
>;

interface SimCloudFrontResponseHeadersPolicyProperties {
  readonly id?: SimCloudFrontResponseHeadersPolicyId;
  readonly name: string;
  readonly customHeaders?: readonly SimCloudFrontResponseHeader[];
  readonly headersToRemove?: readonly string[];
}

/**
 * Simulated CloudFront response headers policy.
 *
 * A policy is attached to a Cache Behavior, and CloudFront applies it to every
 * response that Behavior serves. Headers to remove go first, then the headers
 * to add, so a header named in both ends up present with the policy's value.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-response-headers.html
 */
export class SimCloudFrontResponseHeadersPolicy {
  public readonly id: SimCloudFrontResponseHeadersPolicyId;
  public readonly name: string;
  public readonly customHeaders: readonly SimCloudFrontResponseHeader[];
  public readonly headersToRemove: readonly string[];

  constructor(properties: SimCloudFrontResponseHeadersPolicyProperties) {
    this.id =
      properties.id ?? (randomUUID() as SimCloudFrontResponseHeadersPolicyId);
    this.name = properties.name;
    this.customHeaders = properties.customHeaders ?? [];
    this.headersToRemove = properties.headersToRemove ?? [];
  }

  /**
   * Return the response this policy makes of one the Origin gave back.
   *
   * The body is passed straight through. Only the headers change, so a response
   * whose body has already been read stays readable.
   */
  apply(response: Response): Response {
    const headers = new Headers(response.headers);

    for (const headerName of this.headersToRemove) {
      headers.delete(headerName);
    }

    for (const customHeader of this.customHeaders) {
      customHeader.applyTo(headers);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export type SimCloudFrontResponseHeadersPolicyMap = Map<
  SimCloudFrontResponseHeadersPolicyId,
  SimCloudFrontResponseHeadersPolicy
>;
