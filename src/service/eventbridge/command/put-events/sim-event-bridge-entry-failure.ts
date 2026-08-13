import type { SimPutEventsResultEntry } from "./put-events.command.js";

/**
 * The error code a malformed `Detail` comes back with.
 *
 * This one AWS documents.
 */
export const simEventBridgeMalformedDetailCode = "MalformedDetail";

/**
 * The error code an entry missing a required field comes back with.
 *
 * The API reference documents that EventBridge fails such an entry but not
 * what it calls the failure, so this is taken from the code observed in
 * practice rather than from the documentation.
 */
export const simEventBridgeInvalidArgumentCode = "InvalidArgument";

/**
 * One entry EventBridge would not take, and why.
 *
 * A failure is a value rather than a thrown error because PutEvents keeps
 * going: the rest of the request is processed, and the failure is reported in
 * this entry's place in the result.
 */
export class SimEventBridgeEntryFailure {
  private constructor(
    public readonly code: string,
    public readonly message: string,
  ) {}

  /**
   * An entry whose `Detail` is not a JSON object.
   */
  static malformedDetail(): SimEventBridgeEntryFailure {
    return new this(simEventBridgeMalformedDetailCode, "Detail is malformed.");
  }

  /**
   * An entry with none of the field a routable event has to carry.
   */
  static missing(field: string): SimEventBridgeEntryFailure {
    return new this(
      simEventBridgeInvalidArgumentCode,
      `Parameter ${field} is not valid. Reason: ${field} is a required argument.`,
    );
  }

  /**
   * An entry whose `DetailType` is longer than EventBridge takes.
   */
  static detailTypeTooLong(length: number): SimEventBridgeEntryFailure {
    return new this(
      simEventBridgeInvalidArgumentCode,
      `Parameter DetailType is not valid. Reason: DetailType is at most 128 ` +
        `characters, and this one is ${String(length)}.`,
    );
  }

  /**
   * This failure as it appears in the PutEvents result.
   */
  toResultEntry(): SimPutEventsResultEntry {
    return { ErrorCode: this.code, ErrorMessage: this.message };
  }
}
