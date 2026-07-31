import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";

/**
 * The values PutItem and DeleteItem take for ReturnValues. Both answer with the
 * item they replaced or removed, or with nothing at all, so the other modes
 * UpdateItem has are not valid for either.
 */
const writeModes: ReadonlySet<string> = new Set(["NONE", "ALL_OLD"]);

/**
 * The values UpdateItem takes. It changes part of an item rather than replacing
 * it, so it can answer with the item as it was or as it now is, either whole or
 * cut down to the parts the update touched.
 */
const updateModes: ReadonlySet<string> = new Set([
  "NONE",
  "ALL_OLD",
  "ALL_NEW",
  "UPDATED_OLD",
  "UPDATED_NEW",
]);

/**
 * The modes that report the item as it stood before the update.
 */
const beforeModes: ReadonlySet<string> = new Set(["ALL_OLD", "UPDATED_OLD"]);

/**
 * The modes that report the item as it now is.
 */
const afterModes: ReadonlySet<string> = new Set(["ALL_NEW", "UPDATED_NEW"]);

/**
 * The modes that report only the parts of the item the update touched.
 */
const changedModes: ReadonlySet<string> = new Set([
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
   */
  static readForUpdate(
    value: string | undefined,
    operation: string,
  ): SimDynamoDbReturnValues {
    return this.oneOf(
      value,
      operation,
      updateModes,
      "NONE, ALL_OLD, ALL_NEW, UPDATED_OLD or UPDATED_NEW",
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
   * Whether the request asked for the item as it stood before the write.
   */
  reportsBefore(): boolean {
    return beforeModes.has(this.mode);
  }

  /**
   * Whether the request asked for the item as it now is.
   */
  reportsAfter(): boolean {
    return afterModes.has(this.mode);
  }

  /**
   * Whether the request asked for the parts the update touched rather than the
   * whole item.
   */
  reportsOnlyChanged(): boolean {
    return changedModes.has(this.mode);
  }
}
