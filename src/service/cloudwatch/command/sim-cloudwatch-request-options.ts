import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * The condition key naming the namespace a PutMetricData request writes into.
 *
 * CloudWatch metrics have no ARN, so a policy cannot scope this action by
 * resource. This key is what a policy narrows it with instead, and it is the
 * only way to grant a principal the right to publish into one namespace and no
 * other.
 */
export const simCloudWatchNamespaceConditionKey = "cloudwatch:namespace";

/**
 * What a simulated CloudWatch request carries besides its command input.
 */
export interface SimCloudWatchRequestOptions {
  /**
   * Who is making the request. An omitted caller is the Account root, as it is
   * everywhere else in the simulation.
   */
  readonly caller?: SimAwsCaller;
}
