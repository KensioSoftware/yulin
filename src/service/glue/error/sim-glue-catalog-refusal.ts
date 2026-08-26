import {
  SimGlueAlreadyExistsException,
  SimGlueEntityNotFoundException,
} from "./sim-glue.error.js";

/**
 * Refuse a name an entity of this kind already has.
 *
 * Creating is not idempotent on real Glue. A second `CreateDatabase` for one
 * name is an `AlreadyExistsException` rather than an update.
 */
export function refuseSimGlueNameInPlace(
  taken: boolean,
  kind: string,
  name: string,
): void {
  if (taken) {
    throw new SimGlueAlreadyExistsException(`${kind} already exists: ${name}`);
  }
}

/** Refuse a name nothing of this kind is stored under. */
export function requireSimGlueFound<T>(
  found: T | undefined,
  kind: string,
  name: string,
): T {
  if (found === undefined) {
    throw new SimGlueEntityNotFoundException(`${kind} not found: ${name}`);
  }

  return found;
}
