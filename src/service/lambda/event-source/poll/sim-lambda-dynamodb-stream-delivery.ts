import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaDynamoDbStreamEventSourceArn } from "../stream/sim-lambda-dynamodb-stream-event-source-arn.js";
import type { SimLambdaEventSourceStreamRecord } from "../stream/sim-lambda-event-source-streams.js";
import { SimLambdaStreamCascadeGuard } from "../stream/sim-lambda-stream-cascade-guard.js";
import { SimLambdaStreamHalt } from "../stream/sim-lambda-stream-halt.js";
import { SimLambdaDynamoDbStreamEventBuilder } from "./sim-lambda-dynamodb-stream-event.js";
import { countSimLambdaDynamoDbIteratorAge } from "./sim-lambda-stream-iterator-age.js";
import { simLambdaDynamoDbStreamRecordTimes } from "./sim-lambda-stream-record-times.js";
import type { SimLambdaStreamBatchOutcome } from "./sim-lambda-stream-batch-outcome.js";
import { SimLambdaStreamBatchResponse } from "./sim-lambda-stream-batch-response.js";

interface SimLambdaDynamoDbStreamDeliveryProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaDynamoDbStreamEventSourceArn;
}

/**
 * Hands one batch of stream records to a function and says what became of it.
 *
 * The batch is invoked directly rather than through the Invoke command because
 * the handler's error has to be seen: an asynchronous invocation drops it, and
 * this is what decides whether the mapping's checkpoint moves.
 *
 * The answer is one place on the shard rather than a pair of lists, which is
 * the difference between a stream and a queue. What that place is depends on
 * what the function said, so the batch response decides it.
 *
 * What the function did with the table while it ran is part of the same
 * question, so the cascade guard belongs here too. It counts the deliveries a
 * handler's own writes bring on, and refuses the mapping once that chain is
 * long enough to say the simulation will never settle.
 */
export class SimLambdaDynamoDbStreamDelivery {
  private readonly eventBuilder: SimLambdaDynamoDbStreamEventBuilder;
  private readonly batchResponse: SimLambdaStreamBatchResponse;
  private readonly cascade: SimLambdaStreamCascadeGuard;
  private readonly halt = new SimLambdaStreamHalt();

  constructor(properties: SimLambdaDynamoDbStreamDeliveryProperties) {
    this.eventBuilder = new SimLambdaDynamoDbStreamEventBuilder(
      properties.eventSourceArn,
    );
    this.batchResponse = new SimLambdaStreamBatchResponse(
      properties.mapping.reportsBatchItemFailures,
    );
    this.cascade = new SimLambdaStreamCascadeGuard({
      mapping: properties.mapping,
      halt: this.halt,
      source: {
        streamArn: properties.eventSourceArn.value,
        wroteTo: `wrote to the table ${properties.eventSourceArn.tableName}`,
        sourceRelation: "that table's own stream",
        advice: "Write the result to a different table.",
      },
    });
  }

  /**
   * Deliver a batch, answering with what became of it.
   */
  async to(
    simFunction: SimLambdaFunction,
    records: readonly SimLambdaEventSourceStreamRecord[],
  ): Promise<SimLambdaStreamBatchOutcome> {
    return await this.cascade.around(
      async () => await this.handled(simFunction, records),
    );
  }

  /**
   * Whether this mapping has finished polling, which deleting it and refusing
   * it both settle.
   */
  get stopped(): boolean {
    return this.halt.stopped;
  }

  /**
   * Finish this mapping, as deleting it does.
   */
  stop(): void {
    this.halt.stop();
  }

  /**
   * Note a record written to the polled stream, which counts only while this
   * mapping's own function is running.
   */
  noteRecordWritten(): void {
    this.cascade.noteRecordWritten();
  }

  private async handled(
    simFunction: SimLambdaFunction,
    records: readonly SimLambdaEventSourceStreamRecord[],
  ): Promise<SimLambdaStreamBatchOutcome> {
    const times = simLambdaDynamoDbStreamRecordTimes(records);

    try {
      return this.batchResponse.handled(
        times,
        await simFunction.invoke(this.eventBuilder.of(records)),
      );
    } catch {
      // As on real Lambda, the handler error goes to the function's logs. What
      // the table sees is the batch being tried again.
      return this.batchResponse.failed(times);
    } finally {
      countSimLambdaDynamoDbIteratorAge(simFunction, records);
    }
  }
}
