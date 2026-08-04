import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaDynamoDbStreamEventSourceArn } from "../stream/sim-lambda-dynamodb-stream-event-source-arn.js";
import type { SimLambdaEventSourceStreamRecord } from "../stream/sim-lambda-event-source-streams.js";
import { SimLambdaStreamCascadeGuard } from "../stream/sim-lambda-stream-cascade-guard.js";
import { SimLambdaDynamoDbStreamEventBuilder } from "./sim-lambda-dynamodb-stream-event.js";

interface SimLambdaDynamoDbStreamDeliveryProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaDynamoDbStreamEventSourceArn;
}

/**
 * Hands one batch of stream records to a function and says whether it took
 * them.
 *
 * The batch is invoked directly rather than through the Invoke command because
 * the handler's error has to be seen: an asynchronous invocation drops it, and
 * this is what decides whether the mapping's checkpoint moves.
 *
 * There is no partial answer here, unlike a queue delivery. A function reading
 * a stream either handled the batch or did not, until it is allowed to report
 * its own batch item failures.
 *
 * What the function did with the table while it ran is part of the same
 * question, so the cascade guard belongs here too: a handler writing back into
 * its own source table is refused rather than handled.
 */
export class SimLambdaDynamoDbStreamDelivery {
  private readonly eventBuilder: SimLambdaDynamoDbStreamEventBuilder;
  private readonly cascade: SimLambdaStreamCascadeGuard;

  constructor(properties: SimLambdaDynamoDbStreamDeliveryProperties) {
    this.eventBuilder = new SimLambdaDynamoDbStreamEventBuilder(
      properties.eventSourceArn,
    );
    this.cascade = new SimLambdaStreamCascadeGuard(properties);
  }

  /**
   * Deliver a batch, answering with whether the function handled it.
   */
  async to(
    simFunction: SimLambdaFunction,
    records: readonly SimLambdaEventSourceStreamRecord[],
  ): Promise<boolean> {
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
  ): Promise<boolean> {
    try {
      await simFunction.invoke(this.eventBuilder.of(records));

      return true;
    } catch {
      // As on real Lambda, the handler error goes to the function's logs. What
      // the table sees is the batch being tried again.
      return false;
    }
  }
}
