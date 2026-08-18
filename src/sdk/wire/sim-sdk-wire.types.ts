/**
 * One AWS API request as it appears on the wire, after the SDK has serialized
 * and signed it.
 *
 * This is what is left of an SDK Command once a deployment package bundles the
 * SDK: the Command object never crosses a module boundary the simulator can
 * intercept, so the request itself is the only thing there is to work with.
 */
export interface SimSdkWireRequest {
  readonly method: string;
  readonly hostname: string;
  readonly path: string;
  /**
   * Request headers, with lower-cased names, as HTTP header names are
   * case-insensitive and the SDK is not consistent about which case it sends.
   */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

/**
 * One AWS API response as the SDK expects to read it off the wire.
 */
export interface SimSdkWireResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}
