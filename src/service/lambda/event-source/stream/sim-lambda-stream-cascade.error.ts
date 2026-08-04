import { SimLambdaError } from "../../error/sim-lambda.error.js";

interface SimLambdaStreamCascadeErrorProperties {
  readonly functionName: string;
  readonly streamArn: string;
  readonly tableName: string;
}

/**
 * A function writing back into the table whose stream invoked it.
 *
 * Every one of those writes is another stream record, which is another
 * delivery, which is another write. Real Lambda runs that loop for as long as
 * the account is willing to pay for it. Nothing here stops on its own, so the
 * simulation would go round until the test timed out with nothing to point at.
 *
 * This is a simulator guard rather than AWS behaviour, and it is deliberately
 * not silent: a projection or an aggregate belongs in a second table, and a
 * test whose handler writes to its own source table is testing a loop.
 */
export class SimLambdaStreamCascadeError extends SimLambdaError {
  public override readonly name = "SimLambdaStreamCascadeError";

  constructor(properties: SimLambdaStreamCascadeErrorProperties) {
    super(
      `Function ${properties.functionName} wrote to the table ` +
        `${properties.tableName} while handling records from that table's ` +
        `own stream ${properties.streamArn}. Each write would be delivered ` +
        "back to the function, so the simulation would never settle. Write " +
        "the result to a different table.",
    );
  }
}
