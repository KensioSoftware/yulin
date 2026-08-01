import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbDocumentValueError } from "../error/dynamodb.error.js";
import { simDynamoDbDocumentNativeNumber } from "./sim-dynamodb-document-number.js";

/**
 * Read an AttributeValue back as the native value the document client answers
 * with.
 *
 * Sets come back as JavaScript Sets, binary as the bytes it was stored as, and
 * a map or list as a plain object or array of native values. That is the
 * conversion the document client does on the way out, which an intercepted send
 * never reaches.
 */
export function simDynamoDbDocumentNativeValue(
  value: SimDynamoDbAttributeValue,
  path: string,
): unknown {
  if (value.NULL !== undefined) {
    return null;
  }

  if (value.BOOL !== undefined) {
    return value.BOOL;
  }

  if (value.S !== undefined) {
    return value.S;
  }

  if (value.N !== undefined) {
    return simDynamoDbDocumentNativeNumber(value.N, path);
  }

  if (value.B !== undefined) {
    return value.B;
  }

  return container(value, path);
}

/**
 * Read the attributes that hold other values.
 */
function container(value: SimDynamoDbAttributeValue, path: string): unknown {
  if (value.L !== undefined) {
    return value.L.map((member, index) =>
      simDynamoDbDocumentNativeValue(member, `${path}[${index.toString()}]`),
    );
  }

  if (value.M !== undefined) {
    return simDynamoDbDocumentNativeValues(value.M, path);
  }

  if (value.SS !== undefined) {
    return new Set(value.SS);
  }

  if (value.NS !== undefined) {
    return new Set(
      value.NS.map((member, index) =>
        simDynamoDbDocumentNativeNumber(member, `${path}[${index.toString()}]`),
      ),
    );
  }

  if (value.BS !== undefined) {
    return new Set(value.BS);
  }

  throw new SimDynamoDbDocumentValueError(
    `${path} carries no attribute type the document client can read`,
  );
}

/**
 * Read a record of AttributeValues back as native values, which is what an
 * Item, a Key or a set of expression values comes back as.
 */
export function simDynamoDbDocumentNativeValues(
  values: Readonly<Record<string, SimDynamoDbAttributeValue>>,
  path: string,
): Record<string, unknown> {
  const native: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(values)) {
    // eslint-disable-next-line security/detect-object-injection -- an attribute name the table holds, copied into an object built here.
    native[name] = simDynamoDbDocumentNativeValue(value, `${path}.${name}`);
  }

  return native;
}
