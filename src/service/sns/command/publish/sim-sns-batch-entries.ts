import {
  SimSnsBatchEntryIdsNotDistinctException,
  SimSnsEmptyBatchRequestException,
  SimSnsError,
  SimSnsInvalidBatchEntryIdException,
  SimSnsTooManyEntriesInBatchRequestException,
} from "../../error/sim-sns.error.js";
import type { SimSnsBatchResultErrorEntry } from "./publish.command.js";

const maximumEntries = 10;

const entryIdPattern = /^[\w-]{1,80}$/;

/**
 * What every batch request entry carries: an id the response reports it under.
 */
export interface SimSnsIdentifiedEntry {
  readonly Id?: string | undefined;
}

/**
 * One entry of a batch request whose id has been checked.
 */
export interface SimSnsBatchEntry<T> {
  readonly id: string;
  readonly entry: T;
}

/**
 * The outcome of running a batch: what went through, and what failed on its own.
 */
export interface SimSnsBatchOutcome<T> {
  readonly successful: readonly T[];
  readonly failed: readonly SimSnsBatchResultErrorEntry[];
}

/**
 * Check the entries of a batch request the way real SNS checks them.
 *
 * These are the failures that take the whole request down rather than one
 * entry: an empty batch, more than ten entries, a malformed id, or two entries
 * sharing one. Everything else is a per-entry failure, reported in `Failed`
 * while the rest of the batch goes through.
 */
export function requireSnsBatchEntries<T extends SimSnsIdentifiedEntry>(
  entries: readonly T[] | undefined,
): readonly SimSnsBatchEntry<T>[] {
  if (entries === undefined || entries.length === 0) {
    throw new SimSnsEmptyBatchRequestException(
      "There should be at least one PublishBatchRequestEntry in the request",
    );
  }

  if (entries.length > maximumEntries) {
    throw new SimSnsTooManyEntriesInBatchRequestException(
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
    throw new SimSnsBatchEntryIdsNotDistinctException(
      "Two or more batch entries in the request have the same Id",
    );
  }

  return checked;
}

/**
 * Run every entry of a batch, keeping one entry's failure out of the way of the
 * others.
 *
 * Real SNS answers a batch request with two lists rather than failing it, so a
 * message with an attribute it will not take does not stop the nine beside it
 * being published.
 */
export function runSnsBatch<T, R>(
  entries: readonly SimSnsBatchEntry<T>[],
  run: (entry: T, id: string) => R,
): SimSnsBatchOutcome<R> {
  const successful: R[] = [];
  const failed: SimSnsBatchResultErrorEntry[] = [];

  for (const { id, entry } of entries) {
    try {
      successful.push(run(entry, id));
    } catch (error) {
      // Only an SNS failure belongs to one entry. Anything else, an IAM denial
      // above all, is about the request as a whole.
      if (!(error instanceof SimSnsError)) {
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
    throw new SimSnsInvalidBatchEntryIdException(
      `A batch entry id is required, and may contain up to 80 alphanumeric ` +
        `characters, hyphens and underscores. Got '${String(id)}'.`,
    );
  }

  return id;
}
