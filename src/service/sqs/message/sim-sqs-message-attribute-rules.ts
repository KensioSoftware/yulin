import {
  SimSqsInvalidParameterValue,
  SimSqsUnsupportedOperation,
} from "../error/sim-sqs.error.js";
import {
  SimSqsBinaryPayload,
  type SimSqsMessageAttributePayload,
  SimSqsStringPayload,
} from "./sim-sqs-message-attribute-payload.js";
import type { SimSqsMessageAttributeValue } from "./sim-sqs-message-attribute-value.js";

const attributeNamePattern = /^[\w\-.]{1,256}$/;

const reservedNamePrefixes = ["aws.", "amazon."];

const baseDataTypes = ["String", "Number", "Binary"];

/**
 * What real SQS accepts as a message attribute.
 *
 * These are real SQS rules rather than conveniences, so an attribute they accept
 * is one AWS would accept.
 */
export function assertUsableAttributeName(name: string): void {
  const invalid = new SimSqsInvalidParameterValue(
    `The message attribute name '${name}' is invalid. Attribute names may ` +
      `contain alphanumeric characters, underscores, hyphens and periods, may ` +
      `not begin or end with a period, may not contain two periods in ` +
      `succession, and may not begin with a reserved AWS prefix.`,
  );

  if (!attributeNamePattern.test(name)) {
    throw invalid;
  }

  if (name.startsWith(".") || name.endsWith(".") || name.includes("..")) {
    throw invalid;
  }

  const lowerCased = name.toLowerCase();

  if (reservedNamePrefixes.some((prefix) => lowerCased.startsWith(prefix))) {
    throw invalid;
  }
}

/**
 * Check the data type an attribute declares, which is one of three, optionally
 * followed by a custom label.
 */
export function assertUsableDataType(name: string, dataType: string): void {
  const isKnown = baseDataTypes.some(
    (baseType) => dataType === baseType || dataType.startsWith(`${baseType}.`),
  );

  if (!isKnown) {
    throw new SimSqsInvalidParameterValue(
      `The message attribute '${name}' has an invalid message attribute type: ` +
        `the type must be String, Number or Binary, optionally followed by a ` +
        `custom label`,
    );
  }
}

/**
 * Read the value of an attribute, which has to match the data type it declares.
 *
 * List-valued attributes are reserved for future use by real SQS, which refuses
 * them, so this simulation refuses them too rather than storing something AWS
 * would not accept.
 */
export function attributePayload(
  name: string,
  dataType: string,
  value: SimSqsMessageAttributeValue,
): SimSqsMessageAttributePayload {
  if (
    value.StringListValues !== undefined ||
    value.BinaryListValues !== undefined
  ) {
    throw new SimSqsUnsupportedOperation(
      `The message attribute '${name}' carries list values, which real SQS ` +
        `reserves for future use and does not accept`,
    );
  }

  if (dataType.startsWith("Binary")) {
    if (value.BinaryValue === undefined || value.StringValue !== undefined) {
      throw invalidPayload(name, dataType, "BinaryValue");
    }

    return new SimSqsBinaryPayload(value.BinaryValue);
  }

  if (value.StringValue === undefined || value.BinaryValue !== undefined) {
    throw invalidPayload(name, dataType, "StringValue");
  }

  return new SimSqsStringPayload(value.StringValue);
}

function invalidPayload(
  name: string,
  dataType: string,
  expected: string,
): SimSqsInvalidParameterValue {
  return new SimSqsInvalidParameterValue(
    `The message attribute '${name}' must carry exactly one ${expected} for ` +
      `its ${dataType} data type`,
  );
}
