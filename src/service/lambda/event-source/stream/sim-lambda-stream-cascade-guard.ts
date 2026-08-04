import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import type { SimLambdaDynamoDbStreamEventSourceArn } from "./sim-lambda-dynamodb-stream-event-source-arn.js";
import { simLambdaEventSourceDeliveryContext } from "./sim-lambda-event-source-delivery-context.js";
import { SimLambdaStreamCascadeError } from "./sim-lambda-stream-cascade.error.js";

interface SimLambdaStreamCascadeGuardProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaDynamoDbStreamEventSourceArn;
}

/**
 * Watches one mapping's deliveries for the function writing back into the table
 * whose stream invoked it.
 *
 * The delivery runs inside its own asynchronous context, so a record written by
 * the handler is told apart from one written by anything else that happened to
 * be running at the same time. That distinction is the whole point: several
 * items written at once are an ordinary batch, and a handler feeding its own
 * source is a loop.
 */
export class SimLambdaStreamCascadeGuard {
  private readonly properties: SimLambdaStreamCascadeGuardProperties;
  private cascaded = false;

  constructor(properties: SimLambdaStreamCascadeGuardProperties) {
    this.properties = properties;
  }

  /**
   * Run one delivery, refusing afterwards if the function fed its own source.
   *
   * The refusal comes after the delivery rather than during it, so the handler
   * sees its own write succeed and the loop is reported to whoever is waiting
   * for the simulation to settle.
   */
  async around<Result>(delivery: () => Promise<Result>): Promise<Result> {
    const result = await simLambdaEventSourceDeliveryContext.run(
      this,
      delivery,
    );

    if (this.cascaded) {
      const { mapping, eventSourceArn } = this.properties;

      throw new SimLambdaStreamCascadeError({
        functionName: mapping.functionName,
        streamArn: eventSourceArn.value,
        tableName: eventSourceArn.tableName,
      });
    }

    return result;
  }

  /**
   * Note a record written to the polled stream, answering with whether this
   * mapping's own function wrote it.
   */
  noteRecordWritten(): boolean {
    if (!simLambdaEventSourceDeliveryContext.isDelivering(this)) {
      return false;
    }

    this.cascaded = true;

    return true;
  }
}
