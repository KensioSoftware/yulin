import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * The condition key naming what a simulated service is reaching the queue for,
 * such as the S3 Bucket an event came from.
 *
 * This is the key a queue policy granting a service principal access is nearly
 * always conditioned on, under `ArnLike`, since a service principal is shared
 * by every resource of that service.
 */
export const simSqsSourceArnConditionKey = "aws:SourceArn";

/**
 * What an SQS request carries besides its command input.
 */
export interface SimSqsRequestOptions {
  /**
   * Who is making the request. An omitted caller is the Account root, as it is
   * everywhere else in the simulation.
   */
  readonly caller?: SimAwsCaller;

  /**
   * What the caller is reaching the queue for, supplied to IAM as
   * `aws:SourceArn`.
   *
   * This is for a simulated service making a request on a resource's behalf,
   * which is how real AWS supplies it. A value the caller does not have is left
   * out rather than supplied empty, so a statement conditioned on it fails to
   * match instead of matching an empty string.
   */
  readonly sourceArn?: string;
}
