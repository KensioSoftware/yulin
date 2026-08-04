import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaDynamoDbStreamEventSourceArn } from "../stream/sim-lambda-dynamodb-stream-event-source-arn.js";
import type { SimLambdaEventSourceStreamRecord } from "../stream/sim-lambda-event-source-streams.js";
import { SimLambdaStreamCascadeGuard } from "../stream/sim-lambda-stream-cascade-guard.js";
import { SimLambdaDynamoDbStreamEventBuilder } from "./sim-lambda-dynamodb-stream-event.js";
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
 * question, so the cascade guard belongs here too: a handler writing back into
 * its own source table is refused rather than handled.
 */
export class SimLambdaDynamoDbStreamDelivery {
  private readonly eventBuilder: SimLambdaDynamoDbStreamEventBuilder;
  private readonly batchResponse: SimLambdaStreamBatchResponse;
  private readonly cascade: SimLambdaStreamCascadeGuard;

  constructor(properties: SimLambdaDynamoDbStreamDeliveryProperties) {
    this.eventBuilder = new SimLambdaDynamoDbStreamEventBuilder(
      properties.eventSourceArn,
    );
    this.batchResponse = new SimLambdaStreamBatchResponse(
      properties.mapping.reportsBatchItemFailures,
    );
    this.cascade = new SimLambdaStreamCascadeGuard(properties);
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
   * Note a record written to the polled stream, answering with whether this
   * mapping's own function wrote it.
   */
  noteRecordWritten(): boolean {
    return this.cascade.noteRecordWritten();
  }

  private async handled(
    simFunction: SimLambdaFunction,
    records: readonly SimLambdaEventSourceStreamRecord[],
  ): Promise<SimLambdaStreamBatchOutcome> {
    try {
      return this.batchResponse.handled(
        records,
        await simFunction.invoke(this.eventBuilder.of(records)),
      );
    } catch {
      // As on real Lambda, the handler error goes to the function's logs. What
      // the table sees is the batch being tried again.
      return this.batchResponse.failed();
    }
  }
}
