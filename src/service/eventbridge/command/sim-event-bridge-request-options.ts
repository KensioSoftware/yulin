import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamConditions } from "../../iam/tag/sim-iam-tag-conditions.js";

/**
 * What an EventBridge request carries besides its command input.
 */
export interface SimEventBridgeRequestOptions {
  /**
   * Who is making the request. An omitted caller is the Account root, as it is
   * everywhere else in the simulation.
   */
  readonly caller?: SimAwsCaller;

  /**
   * The condition values the request itself supplies to IAM, such as the
   * tags a create or tag request sets.
   */
  readonly requestConditions?: SimIamConditions | undefined;
}
