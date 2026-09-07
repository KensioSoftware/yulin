import { isRecord } from "../../../util/type-guard/record.js";

/**
 * The marshalling options a document client was built with.
 *
 * `DynamoDBDocumentClient.from(client, { marshallOptions })` changes what the
 * real conversion does with values it would otherwise refuse, so the simulated
 * conversion reads the same options rather than always applying the defaults.
 * Every one of them is off unless the client asked for it, which is how the
 * real document client leaves them.
 */
export interface SimDynamoDbDocumentMarshallOptions {
  /**
   * Drop an undefined value out of a map, a list or a set instead of refusing
   * it.
   */
  readonly removeUndefinedValues: boolean;

  /**
   * Write an empty string, an empty binary value and an empty set as NULL.
   */
  readonly convertEmptyValues: boolean;

  /**
   * Read a class instance as a map of its own properties.
   */
  readonly convertClassInstanceToMap: boolean;

  /**
   * Write a number outside the safe integer range, digits already lost, rather
   * than refusing it.
   */
  readonly allowImpreciseNumbers: boolean;
}

/**
 * What a document client built with no options of its own converts by.
 */
export const simDynamoDbDocumentMarshallDefaults: SimDynamoDbDocumentMarshallOptions =
  {
    removeUndefinedValues: false,
    convertEmptyValues: false,
    convertClassInstanceToMap: false,
    allowImpreciseNumbers: false,
  };

/**
 * Read the marshalling options off the client a Command was sent through.
 *
 * `DynamoDBDocumentClient` keeps the translation config it was built with on
 * its resolved config, which is where the real marshalling middleware reads it
 * from. A client that named none, and anything that is not a document client
 * at all, converts by the defaults.
 */
export function simDynamoDbDocumentMarshallOptions(
  client: unknown,
): SimDynamoDbDocumentMarshallOptions {
  const config = isRecord(client) ? client["config"] : undefined;
  const translateConfig = isRecord(config)
    ? config["translateConfig"]
    : undefined;
  const options = isRecord(translateConfig)
    ? translateConfig["marshallOptions"]
    : undefined;

  if (!isRecord(options)) {
    return simDynamoDbDocumentMarshallDefaults;
  }

  return {
    removeUndefinedValues: options["removeUndefinedValues"] === true,
    convertEmptyValues: options["convertEmptyValues"] === true,
    convertClassInstanceToMap: options["convertClassInstanceToMap"] === true,
    allowImpreciseNumbers: options["allowImpreciseNumbers"] === true,
  };
}
