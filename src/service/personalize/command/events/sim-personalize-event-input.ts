import { SimPersonalizeInvalidInputException } from "../../error/sim-personalize.error.js";
import type { SimPersonalizeProperties } from "./events.command.js";

/**
 * The most records real Personalize accepts in one PutEvents, PutItems or
 * PutUsers request.
 */
const maximumBatchSize = 10;

/**
 * Read the records of one request, refusing a batch real Personalize would
 * refuse.
 *
 * The limit is worth keeping. Code that batches without counting works in a
 * test and fails on AWS at the eleventh record.
 */
export function requireSimPersonalizeBatch<T>(
  records: readonly T[] | undefined,
  fieldName: string,
): readonly T[] {
  if (records === undefined || records.length === 0) {
    throw new SimPersonalizeInvalidInputException(
      `A ${fieldName} of at least one record is required`,
    );
  }

  if (records.length > maximumBatchSize) {
    throw new SimPersonalizeInvalidInputException(
      `${fieldName} carries ${records.length} records. Personalize accepts ` +
        `up to ${maximumBatchSize} in one request.`,
    );
  }

  return records;
}

/**
 * Read a required field of a record, naming it in the refusal.
 */
export function requireSimPersonalizeField(
  value: string | undefined,
  fieldName: string,
): string {
  if (value === undefined || value === "") {
    throw new SimPersonalizeInvalidInputException(`A ${fieldName} is required`);
  }

  return value;
}

/**
 * Read the metadata of an event, an item or a user as the JSON string the wire
 * would have carried.
 *
 * The SDK turns an object into a JSON string on its way out. An intercepted
 * Command is read before that happens, so the object arrives whole and is
 * serialised here.
 */
export function readSimPersonalizeProperties(
  properties: SimPersonalizeProperties | undefined,
): string | undefined {
  if (properties === undefined) {
    return undefined;
  }

  if (typeof properties === "string") {
    return properties;
  }

  return JSON.stringify(properties);
}
