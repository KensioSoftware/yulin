import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import { simLambdaEventSourceDeliveryContext } from "./sim-lambda-event-source-delivery-context.js";
import { SimLambdaStreamCascadeError } from "./sim-lambda-stream-cascade.error.js";

/**
 * The source a guard watches, said in the terms its own service uses.
 */
export interface SimLambdaStreamCascadeSource {
  readonly streamArn: string;

  /**
   * What the function did, as a clause a sentence can hold.
   */
  readonly wroteTo: string;

  /**
   * How the stream it was invoked from relates to what it wrote to.
   */
  readonly sourceRelation: string;

  /**
   * What to do instead of feeding the source that invoked the function.
   */
  readonly advice: string;
}

interface SimLambdaStreamCascadeGuardProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly source: SimLambdaStreamCascadeSource;
}

/**
 * Watches one mapping's deliveries for the function writing back into the
 * source whose stream invoked it.
 *
 * The delivery runs inside its own asynchronous context, so a record written by
 * the handler is told apart from one written by anything else that happened to
 * be running at the same time. That distinction is the whole point: several
 * records written at once are an ordinary batch, and a handler feeding its own
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
      const { mapping, source } = this.properties;

      throw new SimLambdaStreamCascadeError({
        functionName: mapping.functionName,
        streamArn: source.streamArn,
        wroteTo: source.wroteTo,
        sourceRelation: source.sourceRelation,
        advice: source.advice,
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
