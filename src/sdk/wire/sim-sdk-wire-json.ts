import { isRecord } from "../../util/type-guard/record.js";
import { SimSdkWireJsonDecoder } from "./sim-sdk-wire-json-decoder.js";

/**
 * Read an AWS JSON protocol request body as the Command input it was
 * serialized from.
 *
 * An operation taking no input sends an empty body, which is the input `{}`.
 *
 * The wire shapes of the JSON protocols are the Command input shapes, member
 * for member, apart from the two kinds of value JSON cannot carry. Blobs
 * travel base64-encoded and timestamps as epoch seconds, and the operation's
 * schema says which members those are, so they are decoded by it.
 */
export function readSimSdkWireInput(
  body: Uint8Array,
  serviceId: string,
  operationName: string,
): unknown {
  return SimSdkWireJsonDecoder.decodeInput(
    serviceId,
    operationName,
    parseJsonBody(body),
  );
}

function parseJsonBody(body: Uint8Array): unknown {
  if (body.byteLength === 0) {
    return {};
  }

  return JSON.parse(Buffer.from(body).toString()) as unknown;
}

/**
 * Serialize a simulated service operation output as an AWS JSON protocol
 * response body.
 *
 * Blobs and timestamps are encoded as the protocol carries them, because the
 * SDK that will read this back decodes them by schema: an ISO date string
 * where it expects epoch seconds fails to parse, rather than arriving as the
 * wrong value.
 */
export function simSdkWireJsonBody(value: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(wireJsonValue(value) ?? {}));
}

/**
 * Encode the values whose JavaScript form differs from their wire form.
 *
 * This is done before serializing rather than while serializing, because
 * JSON.stringify applies toJSON on the way past: a Date would already have
 * become an ISO string by the time anything got to look at it.
 */
function wireJsonValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.getTime() / 1000;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  if (Array.isArray(value)) {
    return value.map((member) => wireJsonValue(member));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([name, member]) => [
        name,
        wireJsonValue(member),
      ]),
    );
  }
  return value;
}
