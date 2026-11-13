import { randomUUID } from "node:crypto";

import type {
  SimLambdaStreamDiscard,
  SimLambdaStreamFailureRecord,
} from "./sim-lambda-stream-failure-record.js";

/**
 * The object a failed stream batch is written to an S3 Bucket as.
 */
export interface SimLambdaStreamFailureObject {
  readonly key: string;
  readonly body: string;
}

/**
 * The object real Lambda writes for a failed stream batch.
 *
 * The body is the record a queue or topic receives, with `payload` added. That
 * is the event the discarded records were handed to the function in, as a JSON
 * string, holding only the records the function was handed. A record the
 * mapping's filters kept back is counted in the batch info and left out of the
 * payload. The key follows the layout AWS documents,
 * `aws/lambda/<ESM-UUID>/<shardID>/YYYY/MM/DD/YYYY-MM-DDTHH.MM.SS-<UUID>`,
 * dated by when the batch was discarded.
 * @see https://docs.aws.amazon.com/lambda/latest/dg/kinesis-on-failure-destination.html
 */
export function simLambdaStreamFailureObject(
  mappingUuid: string,
  discard: SimLambdaStreamDiscard,
  record: SimLambdaStreamFailureRecord,
): SimLambdaStreamFailureObject {
  const shardId =
    (record.KinesisBatchInfo ?? record.DDBStreamBatchInfo)?.shardId ?? "";
  const [date = "", time = ""] = discard.at.toISOString().split("T", 2);
  const stamp = `${date}T${time.slice(0, 8).replaceAll(":", ".")}`;
  const payload = {
    Records: discard.records
      .map((one) => one.eventRecord)
      .filter((eventRecord) => eventRecord !== undefined),
  };

  return {
    key:
      `aws/lambda/${mappingUuid}/${shardId}/` +
      `${date.replaceAll("-", "/")}/${stamp}-${randomUUID()}`,
    body: JSON.stringify({ ...record, payload: JSON.stringify(payload) }),
  };
}
