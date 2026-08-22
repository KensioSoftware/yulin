import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * What a Firehose request carries besides its command input.
 */
export interface SimFirehoseRequestOptions {
  /**
   * Who is making the request. An omitted caller is the Account root, as it is
   * everywhere else in the simulation.
   */
  readonly caller?: SimAwsCaller;
}
