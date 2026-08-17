import {
  SimSnsInvalidParameterValueException,
  SimSnsUnsimulatedInputException,
} from "../error/sim-sns.error.js";
import type { SimSnsMessageAttributeValue } from "./sim-sns-message-attribute-value.js";
import {
  simSnsSmsAttributeNames,
  simSnsUnsimulatedSmsAttributes,
} from "./sim-sns-sms-attributes.js";

const attributeNamePattern = /^[\w\-.]{1,256}$/;

const reservedNamePrefixes = ["aws.", "amazon."];

/**
 * The data types real SNS accepts, each optionally followed by a custom label.
 *
 * `String.Array` is one of them rather than a custom label on `String`: it
 * carries a JSON array in the string value, and a subscription filter policy
 * matches any member of it.
 */
const baseDataTypes = ["String.Array", "String", "Number", "Binary"];

/**
 * The data type prefix that means the value travels as bytes rather than text.
 */
const binaryDataType = "Binary";

/**
 * What real SNS accepts as a message attribute name.
 *
 * These are real SNS rules rather than conveniences, so an attribute they
 * accept is one AWS would accept.
 */
export function assertUsableSnsAttributeName(name: string): void {
  const invalid = new SimSnsInvalidParameterValueException(
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

  if (simSnsSmsAttributeNames.has(name)) {
    return;
  }

  const unsimulated = simSnsUnsimulatedSmsAttributes.get(name);

  if (unsimulated !== undefined) {
    throw new SimSnsUnsimulatedInputException(
      `The ${name} message attribute is not simulated. ${unsimulated}`,
    );
  }

  const lowerCased = name.toLowerCase();

  if (reservedNamePrefixes.some((prefix) => lowerCased.startsWith(prefix))) {
    throw invalid;
  }
}

/**
 * Check the data type an attribute declares, which is one of four, optionally
 * followed by a custom label.
 */
export function assertUsableSnsDataType(name: string, dataType: string): void {
  const isKnown = baseDataTypes.some(
    (baseType) => dataType === baseType || dataType.startsWith(`${baseType}.`),
  );

  if (!isKnown) {
    throw new SimSnsInvalidParameterValueException(
      `The message attribute '${name}' has an invalid message attribute type: ` +
        `the type must be String, String.Array, Number or Binary, optionally ` +
        `followed by a custom label`,
    );
  }
}

/**
 * Read the value of an attribute, which has to match the data type it declares.
 *
 * The value is held as its bytes whichever form it arrived in, because that is
 * what a data type already says: an attribute of a `Binary` type carries bytes
 * and any other carries text. The bytes are copied rather than kept, so a
 * published message does not share an array with the caller that published it.
 */
export function snsAttributeValueBytes(
  name: string,
  dataType: string,
  value: SimSnsMessageAttributeValue,
): Buffer {
  if (dataType.startsWith(binaryDataType)) {
    if (value.BinaryValue === undefined || value.StringValue !== undefined) {
      throw invalidPayload(name, dataType, "BinaryValue");
    }

    return Buffer.from(value.BinaryValue);
  }

  if (value.StringValue === undefined || value.BinaryValue !== undefined) {
    throw invalidPayload(name, dataType, "StringValue");
  }

  return Buffer.from(value.StringValue, "utf8");
}

function invalidPayload(
  name: string,
  dataType: string,
  expected: string,
): SimSnsInvalidParameterValueException {
  return new SimSnsInvalidParameterValueException(
    `The message attribute '${name}' must carry exactly one ${expected} for ` +
      `its ${dataType} data type`,
  );
}
