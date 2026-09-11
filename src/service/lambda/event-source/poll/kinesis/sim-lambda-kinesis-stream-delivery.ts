import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";
import type { SimLambdaEventSourceMapping } from "../../sim-lambda-event-source-mapping.js";
import type { SimLambdaKinesisEventSourceArn } from "../../stream/kinesis/sim-lambda-kinesis-event-source-arn.js";
import type { SimLambdaKinesisStreamRecord } from "../../stream/kinesis/sim-lambda-kinesis-streams.js";
import type { SimLambdaFilterCriteria } from "../../filter/sim-lambda-filter-criteria.js";
import { simLambdaFilteredDelivery } from "../../filter/sim-lambda-filtered-delivery.js";
import { SimLambdaStreamCascadeGuard } from "../../stream/sim-lambda-stream-cascade-guard.js";
import { SimLambdaStreamHalt } from "../../stream/sim-lambda-stream-halt.js";
import { countSimLambdaKinesisIteratorAge } from "../sim-lambda-stream-iterator-age.js";
import {
  simLambdaKinesisStreamRecordTimes,
  type SimLambdaStreamRecordTime,
} from "../sim-lambda-stream-record-times.js";
import { SimLambdaStreamBatchOutcome } from "../sim-lambda-stream-batch-outcome.js";
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
  private readonly halt = new SimLambdaStreamHalt();
  private readonly filterCriteria: SimLambdaFilterCriteria | undefined;

  constructor(properties: SimLambdaKinesisStreamDeliveryProperties) {
    const { eventSourceArn } = properties;

    this.filterCriteria = properties.mapping.filterCriteria;

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
      halt: this.halt,
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
   * Whether this shard has finished polling, which stopping it and refusing it
   * both settle.
   */
  get stopped(): boolean {
    return this.halt.stopped;
  }

  /**
   * Finish this shard, as stopping the mapping does.
   */
  stop(): void {
    this.halt.stop();
  }

  /**
   * Note a record put onto the polled stream, which counts only while this
   * mapping's own function is running.
   */
  noteRecordWritten(): void {
    this.cascade.noteRecordWritten();
  }

  private async handled(
    simFunction: SimLambdaFunction,
    records: readonly SimLambdaKinesisStreamRecord[],
  ): Promise<SimLambdaStreamBatchOutcome> {
    const times = simLambdaKinesisStreamRecordTimes(records);

    return await simLambdaFilteredDelivery({
      criteria: this.filterCriteria,
      records,
      documentOf: (record) => this.eventBuilder.filterDocumentOf(record),
      // A batch the filters emptied is finished with even though the function
      // never saw it, as a filtered record advances a real checkpoint too.
      handled: () => SimLambdaStreamBatchOutcome.handled(times),
      invoke: async (delivered) =>
        await this.invoked(simFunction, delivered, times, records),
    });
  }

  private async invoked(
    simFunction: SimLambdaFunction,
    delivered: readonly SimLambdaKinesisStreamRecord[],
    times: readonly SimLambdaStreamRecordTime[],
    records: readonly SimLambdaKinesisStreamRecord[],
  ): Promise<SimLambdaStreamBatchOutcome> {
    try {
      return this.batchResponse.handled(
        times,
        await simFunction.invoke(this.eventBuilder.of(delivered)),
      );
    } catch {
      // As on real Lambda, the handler error goes to the function's logs. What
      // the stream sees is the batch being tried again.
      return this.batchResponse.failed(times);
    } finally {
      countSimLambdaKinesisIteratorAge(simFunction, records);
    }
  }
}
