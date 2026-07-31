import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";

/**
 * The values PutItem and DeleteItem take for ReturnValues. Both answer with the
 * item they replaced or removed, or with nothing at all, so the other modes
 * UpdateItem has are not valid for either.
 */
const modes: ReadonlySet<string> = new Set(["NONE", "ALL_OLD"]);

/**
 * What a request asks to be given back of the item that was there before it.
 */
export class SimDynamoDbReturnValues {
  private readonly mode: string;

  private constructor(mode: string) {
    this.mode = mode;
  }

  /**
   * Read the ReturnValues a request carries, naming the operation that will
   * not take it when it names a mode that operation does not have.
   */
  static read(
    value: string | undefined,
    operation: string,
  ): SimDynamoDbReturnValues {
    if (value === undefined) {
      return new this("NONE");
    }

    if (!modes.has(value)) {
      throw new SimDynamoDbValidationException(
        `Return values set to invalid value: ${value}. ${operation} takes ` +
          `NONE or ALL_OLD.`,
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
}
