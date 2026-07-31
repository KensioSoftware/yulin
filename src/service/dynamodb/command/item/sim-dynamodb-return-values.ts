import {
  SimDynamoDbUnsupportedOperation,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";

/**
 * The values PutItem and DeleteItem take for ReturnValues. Both answer with the
 * item they replaced or removed, or with nothing at all, so the other modes
 * UpdateItem has are not valid for either.
 */
const writeModes: ReadonlySet<string> = new Set(["NONE", "ALL_OLD"]);

/**
 * The values UpdateItem takes. It changes part of an item rather than replacing
 * it, so it can answer with the item as it was or as it now is.
 */
const updateModes: ReadonlySet<string> = new Set([
  "NONE",
  "ALL_OLD",
  "ALL_NEW",
]);

/**
 * The values real UpdateItem takes and this simulation does not report. Both
 * answer with the attributes the update touched, which is a different answer to
 * the whole item rather than a smaller one.
 */
const unsimulatedUpdateModes: ReadonlySet<string> = new Set([
  "UPDATED_OLD",
  "UPDATED_NEW",
]);

/**
 * What a request asks to be given back of the item it changed.
 */
export class SimDynamoDbReturnValues {
  private readonly mode: string;

  private constructor(mode: string) {
    this.mode = mode;
  }

  /**
   * Read the ReturnValues a write carries, naming the operation that will not
   * take it when it names a mode that operation does not have.
   */
  static read(
    value: string | undefined,
    operation: string,
  ): SimDynamoDbReturnValues {
    return this.oneOf(value, operation, writeModes, "NONE or ALL_OLD");
  }

  /**
   * Read the ReturnValues an update carries.
   *
   * The two modes that report only the attributes the update touched are
   * refused by name, rather than answered with the whole item.
   */
  static readForUpdate(
    value: string | undefined,
    operation: string,
  ): SimDynamoDbReturnValues {
    if (value !== undefined && unsimulatedUpdateModes.has(value)) {
      throw new SimDynamoDbUnsupportedOperation(
        `ReturnValues ${value} is not simulated, so ${operation} refuses it ` +
          `rather than answering with more of the item than was asked for`,
      );
    }

    return this.oneOf(
      value,
      operation,
      updateModes,
      "NONE, ALL_OLD or ALL_NEW",
    );
  }

  /**
   * Read a ReturnValues against the modes one operation has.
   */
  private static oneOf(
    value: string | undefined,
    operation: string,
    modes: ReadonlySet<string>,
    taken: string,
  ): SimDynamoDbReturnValues {
    if (value === undefined) {
      return new this("NONE");
    }

    if (!modes.has(value)) {
      throw new SimDynamoDbValidationException(
        `Return values set to invalid value: ${value}. ${operation} takes ` +
          `${taken}.`,
      );
    }

    return new this(value);
  }

  /**
   * Whether the request asked for the item that was there before it.
   */
  wantsOldItem(): boolean {
    return this.mode === "ALL_OLD";
  }

  /**
   * Whether the request asked for the item as it now is.
   */
  wantsNewItem(): boolean {
    return this.mode === "ALL_NEW";
  }
}
