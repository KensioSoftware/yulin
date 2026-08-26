import {
  SimGlueError,
  SimGlueInvalidInputException,
} from "../../error/sim-glue.error.js";
import type { SimGluePartitionError } from "./partition.command.js";

/** What every entry of a partition batch names its partition with. */
interface SimGluePartitionBatchEntry {
  readonly Values?: readonly string[] | undefined;
}

/**
 * Run each entry of a partition batch, collecting the refusals.
 *
 * A batch does not fail on one bad entry. Real Glue answers with the errors
 * alongside the work it did do, so a caller registering a day's partitions
 * learns which values were already there and keeps the rest.
 *
 * Only a Glue refusal is collected. Anything else is a fault in the simulation
 * rather than something the caller asked for, and a batch that swallowed it
 * would answer as though the entry had merely been rejected.
 *
 * The list itself is a required request member on real Glue. An empty one is
 * within its stated bounds and does nothing. Leaving it out altogether is a
 * malformed request.
 */
export function simGluePartitionBatchErrors<
  T extends SimGluePartitionBatchEntry,
>(
  label: string,
  entries: readonly T[] | undefined,
  handle: (entry: T, entryLabel: string) => void,
): readonly SimGluePartitionError[] {
  if (entries === undefined) {
    throw new SimGlueInvalidInputException(`${label} is required`);
  }

  const errors: SimGluePartitionError[] = [];

  for (const [index, entry] of entries.entries()) {
    try {
      handle(entry, `${label}.${index}`);
    } catch (error) {
      if (!(error instanceof SimGlueError)) {
        throw error;
      }

      errors.push({
        PartitionValues: [...(entry.Values ?? [])],
        ErrorDetail: { ErrorCode: error.name, ErrorMessage: error.message },
      });
    }
  }

  return errors;
}
