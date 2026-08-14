import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * The request context a simulated ECS operation is made in.
 */
export interface SimEcsRequestOptions {
  /**
   * The principal making the request. Defaults to the Account root.
   *
   * It is authorized for the ECS action, and it is also the principal a
   * registered task definition records as having registered it.
   */
  readonly caller?: SimAwsCaller | undefined;
}
