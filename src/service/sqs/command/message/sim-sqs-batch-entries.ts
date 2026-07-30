import {
  SimSqsBatchEntryIdsNotDistinct,
  SimSqsEmptyBatchRequest,
  SimSqsError,
  SimSqsInvalidBatchEntryId,
  SimSqsTooManyEntriesInBatchRequest,
} from "../../error/sim-sqs.error.js";
import type { SimSqsBatchResultErrorEntry } from "./send.command.js";

const maximumEntries = 10;

const entryIdPattern = /^[\w-]{1,80}$/;

/**
 * What every batch request entry carries: an id the response reports it under.
 */
export interface SimSqsIdentifiedEntry {
  readonly Id?: string | undefined;
}

/**
 * One entry of a batch request whose id has been checked.
 */
export interface SimSqsBatchEntry<T> {
  readonly id: string;
  readonly entry: T;
}

/**
 * The outcome of running a batch: what went through, and what failed on its own.
 */
export interface SimSqsBatchOutcome<T> {
  readonly successful: readonly T[];
  readonly failed: readonly SimSqsBatchResultErrorEntry[];
}

/**
 * Check the entries of a batch request the way real SQS checks them.
 *
 * These are the failures that take the whole request down rather than one entry:
 * an empty batch, too many entries, a malformed id, or two entries sharing one.
 * Everything else is a per-entry failure, reported in `Failed` while the rest of
 * the batch goes through.
 */
export function requireBatchEntries<T extends SimSqsIdentifiedEntry>(
  entries: readonly T[] | undefined,
  operation: string,
): readonly SimSqsBatchEntry<T>[] {
  if (entries === undefined || entries.length === 0) {
    throw new SimSqsEmptyBatchRequest(
      `There should be at least one ${operation}BatchRequestEntry in the request`,
    );
  }

  if (entries.length > maximumEntries) {
    throw new SimSqsTooManyEntriesInBatchRequest(
      `Maximum number of entries per request is ${String(maximumEntries)}. ` +
        `You have sent ${String(entries.length)}.`,
    );
  }

  const checked = entries.map((entry) => ({
    id: requireEntryId(entry.Id),
    entry,
  }));
  const ids = new Set(checked.map(({ id }) => id));

  if (ids.size !== checked.length) {
    throw new SimSqsBatchEntryIdsNotDistinct(
      "Two or more batch entries in the request have the same Id",
    );
  }

  return checked;
}

/**
 * Run every entry of a batch, keeping one entry's failure out of the way of the
 * others.
 *
 * Real SQS answers a batch request with two lists rather than failing it, so a
 * message too large for the queue does not stop the nine beside it being sent.
 */
export function runBatch<T, R>(
  entries: readonly SimSqsBatchEntry<T>[],
  run: (entry: T, id: string) => R,
): SimSqsBatchOutcome<R> {
  const successful: R[] = [];
  const failed: SimSqsBatchResultErrorEntry[] = [];

  for (const { id, entry } of entries) {
    try {
      successful.push(run(entry, id));
    } catch (error) {
      // Only an SQS failure belongs to one entry. Anything else, an IAM denial
      // above all, is about the request as a whole.
      if (!(error instanceof SimSqsError)) {
        throw error;
      }

      failed.push({
        Id: id,
        SenderFault: true,
        Code: error.name,
        Message: error.message,
      });
    }
  }

  return { successful, failed };
}

function requireEntryId(id: string | undefined): string {
  if (id === undefined || !entryIdPattern.test(id)) {
    throw new SimSqsInvalidBatchEntryId(
      `A batch entry id is required, and may contain up to 80 alphanumeric ` +
        `characters, hyphens and underscores. Got '${String(id)}'.`,
    );
  }

  return id;
}
