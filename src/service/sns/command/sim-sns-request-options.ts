import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * The condition key naming what a simulated service is reaching the topic for,
 * such as the S3 Bucket an event came from.
 *
 * This is the key a topic policy granting a service principal access is nearly
 * always conditioned on, under `ArnLike`, since a service principal is shared
 * by every resource of that service.
 */
export const simSnsSourceArnConditionKey = "aws:SourceArn";

/**
 * The condition key naming the Account owning the resource a simulated service
 * is reaching the topic for.
 *
 * It only has a job when that resource and the topic are in different Accounts,
 * which is why AWS's own documented topic policies carry it alongside the
 * source ARN.
 */
export const simSnsSourceAccountConditionKey = "aws:SourceAccount";

/**
 * What an SNS request carries besides its command input.
 */
export interface SimSnsRequestOptions {
  /**
   * Who is making the request. An omitted caller is the Account root, as it is
   * everywhere else in the simulation.
   */
  readonly caller?: SimAwsCaller;

  /**
   * What the caller is reaching the topic for, supplied to IAM as
   * `aws:SourceArn`.
   *
   * This is for a simulated service making a request on a resource's behalf,
   * which is how real AWS supplies it. A value the caller does not have is left
   * out rather than supplied empty, so a statement conditioned on it fails to
   * match instead of matching an empty string.
   */
  readonly sourceArn?: string;

  /**
   * The Account owning the resource the caller is reaching the topic for,
   * supplied to IAM as `aws:SourceAccount`.
   *
   * Left out the same way when the caller has no value for it.
   */
  readonly sourceAccount?: string;
}
