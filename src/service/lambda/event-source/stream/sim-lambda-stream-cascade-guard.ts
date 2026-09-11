import type { SimLambdaEventSourceMapping } from "../sim-lambda-event-source-mapping.js";
import { simLambdaEventSourceDeliveryContext } from "./sim-lambda-event-source-delivery-context.js";
import { SimLambdaStreamCascadeError } from "./sim-lambda-stream-cascade.error.js";
import type { SimLambdaStreamHalt } from "./sim-lambda-stream-halt.js";

/**
 * How many deliveries in a row may feed the source that invoked them before the
 * simulation is refused.
 *
 * One write back is a handler doing its job, and the delivery it causes is the
 * chance for that work to finish. A handler that settles takes two or three
 * links of chain. A handler that loops takes every link there is, and the
 * simulation has to say so before the test times out.
 */
export const simLambdaStreamCascadeLimit = 10;

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

  /**
   * What a refusal stops, since a mapping polling on from a checkpoint the
   * refusal left where it was would deliver the same records again.
   */
  readonly halt: SimLambdaStreamHalt;
}

/**
 * Watches one mapping's deliveries for a chain of the function feeding the
 * source whose stream invoked it.
 *
 * The delivery runs inside its own asynchronous context, so a record written by
 * the handler is told apart from one written by anything else that happened to
 * be running at the same time. That distinction is the whole point: several
 * records written at once are an ordinary batch, and a handler feeding its own
 * source is the start of a chain.
 *
 * What the guard counts is the chain, and never the shape of one write. A
 * handler that writes back and then finds its own work done writes nothing the
 * second time round, the chain ends at one link, and the simulation settles. A
 * handler that writes back every time takes the chain to
 * `simLambdaStreamCascadeLimit` and is refused there.
 */
export class SimLambdaStreamCascadeGuard {
  private readonly properties: SimLambdaStreamCascadeGuardProperties;
  private fedRecords = 0;
  private chained = 0;

  constructor(properties: SimLambdaStreamCascadeGuardProperties) {
    this.properties = properties;
  }

  /**
   * Run one delivery, refusing afterwards if the chain has gone on long enough
   * to say the simulation will never settle.
   *
   * The refusal comes after the delivery rather than during it, so the handler
   * sees its own write succeed and the chain is reported to whoever is waiting
   * for the simulation to settle.
   */
  async around<Result>(delivery: () => Promise<Result>): Promise<Result> {
    const fedBefore = this.fedRecords;

    const result = await simLambdaEventSourceDeliveryContext.run(
      this,
      delivery,
    );

    this.chained = this.fedRecords > fedBefore ? this.chained + 1 : 0;

    if (this.chained >= simLambdaStreamCascadeLimit) {
      const { mapping, source } = this.properties;

      this.properties.halt.stop();

      throw new SimLambdaStreamCascadeError({
        functionName: mapping.functionName,
        streamArn: source.streamArn,
        wroteTo: source.wroteTo,
        sourceRelation: source.sourceRelation,
        advice: source.advice,
        deliveries: this.chained,
      });
    }

    return result;
  }

  /**
   * Note a record written to the polled stream, which counts only while this
   * mapping's own function is the thing that is running.
   *
   * Counted rather than flagged, so a delivery can tell whether the count moved
   * while it ran without the flag having to be put back afterwards.
   */
  noteRecordWritten(): void {
    if (simLambdaEventSourceDeliveryContext.isDelivering(this)) {
      this.fedRecords += 1;
    }
  }
}
