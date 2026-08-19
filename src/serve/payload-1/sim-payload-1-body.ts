import { SimProxyBodyEncoding } from "../proxy/sim-proxy-body-encoding.js";

const bodyEncoding = new SimProxyBodyEncoding();

/**
 * How a request body reaches a payload format 1.0 handler.
 *
 * A request with no body sends `null` rather than an empty string, and the
 * flag tells the handler whether what it did get was base64 encoded.
 */
export interface SimPayload1Body {
  readonly body: string | null;
  readonly isBase64Encoded: boolean;
}

/**
 * Read a request body for the event.
 */
export function simPayload1Body(
  bytes: Uint8Array,
  contentType: string | null,
): SimPayload1Body {
  if (bytes.length === 0) {
    return { body: null, isBase64Encoded: false };
  }

  return {
    body: bodyEncoding.encode(bytes, contentType),
    isBase64Encoded: !bodyEncoding.isText(contentType),
  };
}
