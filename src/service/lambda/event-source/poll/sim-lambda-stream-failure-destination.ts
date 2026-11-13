import { isBucketArn } from "../sim-lambda-stream-destination-config.js";
import { simLambdaStreamFailureObject } from "./sim-lambda-stream-failure-object.js";
import type { SimLambdaStreamBatchOutcome } from "./sim-lambda-stream-batch-outcome.js";
import { SimLambdaDestinationArn } from "../../destination/sim-lambda-destination-arn.js";
import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaEventSourceStreamProgressBatch } from "../stream/sim-lambda-event-source-streams.js";
import {
  simLambdaStreamFailureRecord,
  type SimLambdaStreamDiscard,
} from "./sim-lambda-stream-failure-record.js";

/** Count invocations and send discarded batch metadata through the destination service. */
export class SimLambdaStreamFailureDestination {
  private invokeCount = 0;
  private functionError = false;

  constructor(private readonly mapping: SimLambdaEventSourceMapping) {}

  invoked(outcome: SimLambdaStreamBatchOutcome): void {
    this.invokeCount += 1;
    this.functionError = outcome.functionError;
  }

  reset(): void {
    this.invokeCount = 0;
  }

  async deliver(
    discard: SimLambdaStreamDiscard | undefined,
    batch: SimLambdaEventSourceStreamProgressBatch,
    simFunction: SimLambdaFunction,
  ): Promise<void> {
    const mapping = this.mapping;
    const arn = mapping.failureDestinationArn;
    if (discard === undefined || arn === undefined || arn === "") return;
    const record = simLambdaStreamFailureRecord({
      mapping,
      simFunction,
      discard,
      invokeCount: this.invokeCount,
      shardId: batch.shardId,
      functionError: this.functionError,
    });
    if (isBucketArn(arn)) {
      await mapping.destinations.store({
        bucketName: arn.slice("arn:aws:s3:::".length),
        ...simLambdaStreamFailureObject(mapping.uuid, discard, record),
        sourceFunctionArn: mapping.functionArn,
        sourceFunctionRoleArn: simFunction.roleArn,
      });

      return;
    }
    await mapping.destinations.deliver({
      destinationArn: SimLambdaDestinationArn.of(arn),
      sourceFunctionArn: mapping.functionArn,
      sourceFunctionRoleArn: simFunction.roleArn,
      record,
    });
  }
}
