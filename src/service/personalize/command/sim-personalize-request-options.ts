import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * What a caller can say about itself when it reaches simulated Personalize
 * directly rather than through an intercepted SDK client.
 */
export interface SimPersonalizeRequestOptions {
  readonly caller?: SimAwsCaller;
}
