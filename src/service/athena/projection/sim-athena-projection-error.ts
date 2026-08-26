/**
 * A projection configuration this simulation refuses.
 *
 * Athena reports a broken projection as a failed query rather than as a
 * failure to create the table, because Glue accepts any parameters it is given
 * and Athena is what reads them. The message shape follows Athena's
 * `INVALID_TABLE_PROPERTY`, and the wording after that prefix is this
 * simulation's own. Nothing has checked it against AWS.
 */
export class SimAthenaProjectionError extends Error {
  constructor(message: string) {
    super(`INVALID_TABLE_PROPERTY: ${message}`);
    this.name = "SimAthenaProjectionError";
  }
}

/**
 * How many partitions one table may project.
 *
 * Real Athena caps this too, and a projection running to millions of values is
 * a configuration mistake rather than a dataset. Failing says which column ran
 * away, where generating them all would hang the test instead.
 */
export const simAthenaProjectionLimit = 20_000;
