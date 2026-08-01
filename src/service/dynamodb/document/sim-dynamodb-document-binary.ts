/**
 * The kinds the document client reads as binary.
 *
 * They are recognised by constructor name rather than by `instanceof`, which is
 * how the real document client recognises them: a value built in another realm,
 * such as a Buffer from a different module instance, fails an `instanceof`
 * check while still being the thing it says it is.
 */
const binaryConstructorNames: ReadonlySet<string> = new Set([
  "ArrayBuffer",
  "Blob",
  "Buffer",
  "DataView",
  "File",
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
]);

/**
 * Whether a value is one the document client stores as a binary attribute.
 */
export function isSimDynamoDbDocumentBinary(value: unknown): boolean {
  const name = (value as { constructor?: { name?: string } } | undefined)
    ?.constructor?.name;

  return name !== undefined && binaryConstructorNames.has(name);
}
