import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";
import type { SimLambdaEventSourceMapping } from "../../sim-lambda-event-source-mapping.js";
import type { SimLambdaKinesisEventSourceArn } from "../../stream/kinesis/sim-lambda-kinesis-event-source-arn.js";
import type { SimLambdaKinesisStreamRecord } from "../../stream/kinesis/sim-lambda-kinesis-streams.js";
import { SimLambdaStreamCascadeGuard } from "../../stream/sim-lambda-stream-cascade-guard.js";
import { countSimLambdaKinesisIteratorAge } from "../sim-lambda-stream-iterator-age.js";
import { simLambdaStreamSequenceNumbers } from "../sim-lambda-stream-sequence-numbers.js";
import type { SimLambdaStreamBatchOutcome } from "../sim-lambda-stream-batch-outcome.js";
import { SimLambdaStreamBatchResponse } from "../sim-lambda-stream-batch-response.js";
import { SimLambdaKinesisStreamEventBuilder } from "./sim-lambda-kinesis-stream-event.js";

interface SimLambdaKinesisStreamDeliveryProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaKinesisEventSourceArn;
  readonly shardId: string;
  readonly roleArn: string;
}

/**
 * Hands one shard's batch of records to a function and says what became of it.
 *
 * The batch is invoked directly rather than through the Invoke command because
 * the handler's error has to be seen: an asynchronous invocation drops it, and
 * this is what decides whether the mapping's checkpoint moves.
 *
 * There is one of these per shard, because the event a function receives names
 * the shard its records were read from and each shard's batches are answered
 * for on their own.
 */
export class SimLambdaKinesisStreamDelivery {
  private readonly eventBuilder: SimLambdaKinesisStreamEventBuilder;
  private readonly batchResponse: SimLambdaStreamBatchResponse;
  private readonly cascade: SimLambdaStreamCascadeGuard;

  constructor(properties: SimLambdaKinesisStreamDeliveryProperties) {
    const { eventSourceArn } = properties;

    this.eventBuilder = new SimLambdaKinesisStreamEventBuilder({
      eventSourceArn,
      shardId: properties.shardId,
      roleArn: properties.roleArn,
    });
    this.batchResponse = new SimLambdaStreamBatchResponse(
      properties.mapping.reportsBatchItemFailures,
    );
    this.cascade = new SimLambdaStreamCascadeGuard({
      mapping: properties.mapping,
      source: {
        streamArn: eventSourceArn.value,
        wroteTo: `put a record onto the stream ${eventSourceArn.streamName}`,
        sourceRelation: "that same stream",
        advice: "Put the result onto a different stream.",
      },
    });
  }

  /**
   * Deliver a batch, answering with what became of it.
   */
  async to(
    simFunction: SimLambdaFunction,
    records: readonly SimLambdaKinesisStreamRecord[],
  ): Promise<SimLambdaStreamBatchOutcome> {
    return await this.cascade.around(
      async () => await this.handled(simFunction, records),
    );
  }

  /**
   * Note a record put onto the polled stream, answering with whether this
   * mapping's own function put it.
   */
  noteRecordWritten(): boolean {
    return this.cascade.noteRecordWritten();
  }

  private async handled(
    simFunction: SimLambdaFunction,
    records: readonly SimLambdaKinesisStreamRecord[],
  ): Promise<SimLambdaStreamBatchOutcome> {
    try {
      return this.batchResponse.handled(
        sequenceNumbersOf(records),
        await simFunction.invoke(this.eventBuilder.of(records)),
      );
    } catch {
      // As on real Lambda, the handler error goes to the function's logs. What
      // the stream sees is the batch being tried again.
      return this.batchResponse.failed();
    } finally {
      countSimLambdaKinesisIteratorAge(simFunction, records);
    }
  }
}

/**
 * The sequence numbers this batch's records can be named by.
 */
function sequenceNumbersOf(
  records: readonly SimLambdaKinesisStreamRecord[],
): readonly string[] {
  return simLambdaStreamSequenceNumbers(
    records.map((one) => one.SequenceNumber),
  );
}
