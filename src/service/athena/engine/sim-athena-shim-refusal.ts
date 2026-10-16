/**
 * A Trino function shim that could not answer for one value.
 *
 * Each shim raises where it cannot answer faithfully, such as a date function
 * handed text that is no timestamp. SQLite hands the error back out of the
 * statement unchanged, and this class is how the engine tells it apart from
 * SQLite refusing the statement itself.
 *
 * The engine fails the query on one of these whether or not it is strict. The
 * statement parsed and SQLite ran it, so falling back would answer a query the
 * engine had taken on with rows a declaration wrote for some other purpose,
 * often no rows at all.
 */
export class SimAthenaShimRefusal extends Error {
  public override readonly name = "SimAthenaShimRefusal";

  constructor(described: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);

    super(
      `${described} could not answer for this statement's values. ${reason}`,
      {
        cause,
      },
    );
  }
}
