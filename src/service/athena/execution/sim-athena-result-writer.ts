import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAthenaResolvedResult } from "../result/sim-athena-resolved-result.js";
import { SimAthenaOutputLocation } from "./sim-athena-output-location.js";
import type { SimAthenaQueryExecution } from "./sim-athena-query-execution.js";
import { simAthenaResultCsv } from "./sim-athena-result-csv.js";

/**
 * The narrow slice of simulated S3 that writing a result needs.
 *
 * `SimS3` structurally implements this interface, the way
 * `SimFirehoseObjectDestination` is implemented by the same class.
 */
export interface SimAthenaResultDestination {
  putObject(
    command: { input: { Bucket: string; Key: string; Body: Uint8Array } },
    options?: { caller: SimAwsCaller },
  ): Promise<unknown>;
}

interface SimAthenaResultWriterProperties {
  readonly s3: SimAthenaResultDestination;
}

/**
 * Writes one query's result set to the output location it ran under.
 *
 * The write goes through simulated S3 as the caller that started the query.
 * Athena writes a result under the identity that asked for it rather than
 * under a role of its own, so a caller who cannot write to the Bucket fails
 * the query here. That is the same shape as Firehose delivery, which writes
 * under its delivery stream's role.
 */
export class SimAthenaResultWriter {
  private readonly s3: SimAthenaResultDestination;

  constructor(properties: SimAthenaResultWriterProperties) {
    this.s3 = properties.s3;
  }

  /**
   * Write one query's results, and answer with where they went.
   */
  async write(
    execution: SimAthenaQueryExecution,
    result: SimAthenaResolvedResult,
    caller: SimAwsCaller | undefined,
  ): Promise<void> {
    const location = new SimAthenaOutputLocation(execution.outputLocation);
    const body = new TextEncoder().encode(simAthenaResultCsv(result));
    const input = {
      Bucket: location.bucketName,
      Key: location.keyFor(execution.queryExecutionId),
      Body: body,
    };

    await this.s3.putObject(
      { input },
      caller === undefined ? undefined : { caller },
    );
  }
}
