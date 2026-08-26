import {
  SimGlueAlreadyExistsException,
  SimGlueEntityNotFoundException,
} from "../error/sim-glue.error.js";
import type { SimGluePartition } from "./sim-glue-partition.js";

/**
 * Refuse values a partition is already registered under.
 *
 * Registering is not idempotent on real Glue. A second `CreatePartition` for
 * one day's values is an `AlreadyExistsException` rather than an overwrite,
 * which is why a job re-run has to catch it.
 */
export function refuseSimGluePartitionInPlace(
  existing: SimGluePartition | undefined,
  label: string,
): void {
  if (existing !== undefined) {
    throw new SimGlueAlreadyExistsException(
      `Partition already exists: ${label}`,
    );
  }
}

/** Refuse values nothing is registered under. */
export function requireSimGluePartitionFound(
  found: SimGluePartition | undefined,
  label: string,
): SimGluePartition {
  if (found === undefined) {
    throw new SimGlueEntityNotFoundException(`Partition not found: ${label}`);
  }

  return found;
}
