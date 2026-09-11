import { SimLambdaError } from "../../error/sim-lambda.error.js";

interface SimLambdaStreamCascadeErrorProperties {
  readonly functionName: string;
  readonly streamArn: string;

  /**
   * What the function did, as a clause a sentence can hold, such as
   * "wrote to the table orders".
   */
  readonly wroteTo: string;

  /**
   * How the stream it was invoked from relates to what it wrote to, such as
   * "that table's own stream".
   */
  readonly sourceRelation: string;

  /**
   * What to do instead, which differs by source: a DynamoDB projection belongs
   * in a second table, and a Kinesis result belongs on a second stream.
   */
  readonly advice: string;

  /**
   * How many deliveries in a row fed the source, which is the chain the guard
   * counted before it gave up on the simulation settling.
   */
  readonly deliveries: number;
}

/**
 * A function feeding the source whose stream invoked it, delivery after
 * delivery.
 *
 * Every one of those writes is another stream record, which is another
 * delivery, which is another write. Real Lambda runs that loop for as long as
 * the account is willing to pay for it. Nothing here stops on its own, so the
 * simulation would go round until the test timed out with nothing to point at.
 *
 * A handler that writes back and then settles is left alone. This is the chain
 * that carried on, counted by `SimLambdaStreamCascadeGuard` up to
 * `simLambdaStreamCascadeLimit`.
 *
 * This is a simulator guard rather than AWS behaviour, and it is deliberately
 * not silent: a projection or an aggregate that keeps going belongs in a second
 * table or on a second stream.
 */
export class SimLambdaStreamCascadeError extends SimLambdaError {
  public override readonly name = "SimLambdaStreamCascadeError";

  constructor(properties: SimLambdaStreamCascadeErrorProperties) {
    super(
      `Function ${properties.functionName} ${properties.wroteTo} while ` +
        `handling records from ${properties.sourceRelation} ` +
        `${properties.streamArn} on ${String(properties.deliveries)} ` +
        `deliveries in a row. Each of those writes was delivered back to the ` +
        `function and brought on the next one, and the simulation is still ` +
        `going round. ${properties.advice}`,
    );
  }
}
