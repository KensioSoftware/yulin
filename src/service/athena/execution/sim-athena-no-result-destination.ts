import { SimAthenaInvalidRequestException } from "../error/sim-athena.error.js";

/**
 * The result destination a standalone SimAthena has, which is none.
 *
 * A Bucket only exists inside a SimAws, so a SimAthena built on its own has
 * nowhere to put a result set. The query fails saying so rather than reaching
 * `SUCCEEDED` while nothing was written.
 */
export class SimAthenaNoResultDestination {
  putObject(): Promise<unknown> {
    return Promise.reject(
      new SimAthenaInvalidRequestException(
        "This simulated Athena has no simulated S3 to write results to. A " +
          "query writes its results through the S3 of the same SimAws scope.",
      ),
    );
  }
}
