import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimKvsUpdateKeysCommand } from "./sim-cf-key-value-store-data-command.types.js";

type UpdateKeysInput = SimKvsUpdateKeysCommand["input"];

/**
 * Read the puts out of an UpdateKeys batch, refusing an incomplete pair.
 *
 * The SDK types a batch entry's key and value as `string | undefined` even
 * though both are required, so an entry missing either reaches here as a
 * well-typed value. Refusing it is what stops a key being written as the string
 * "undefined".
 */
export function kvsBatchPuts(
  input: UpdateKeysInput,
): readonly { Key: string; Value: string }[] {
  return (input.Puts ?? []).map((put, index) => {
    assertDefined(
      put.Key,
      `UpdateKeysCommand.input.Puts[${String(index)}].Key`,
    );
    assertDefined(
      put.Value,
      `UpdateKeysCommand.input.Puts[${String(index)}].Value`,
    );

    return { Key: put.Key, Value: put.Value };
  });
}

/**
 * Read the deletes out of an UpdateKeys batch, refusing one with no key.
 */
export function kvsBatchDeletes(
  input: UpdateKeysInput,
): readonly { Key: string }[] {
  return (input.Deletes ?? []).map((remove, index) => {
    assertDefined(
      remove.Key,
      `UpdateKeysCommand.input.Deletes[${String(index)}].Key`,
    );

    return { Key: remove.Key };
  });
}
