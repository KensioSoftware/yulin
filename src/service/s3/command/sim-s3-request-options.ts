import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";

/**
 * The condition key naming what a simulated service is reaching the Bucket for,
 * such as the CloudFront Distribution an Origin read belongs to.
 *
 * This is the key a Bucket policy granting a service principal is nearly always
 * conditioned on, since a service principal is shared by every resource of that
 * service. CDK writes it as `AWS:SourceArn`, which matches the same key: the
 * condition matcher is case insensitive on key names, as IAM is.
 */
export const simS3SourceArnConditionKey = "aws:SourceArn";

/**
 * The condition key naming the Account owning the resource a simulated service
 * is reaching the Bucket for.
 *
 * It only has a job when that resource and the Bucket are in different
 * Accounts, which is why AWS's own documented Bucket policies carry it
 * alongside the source ARN.
 */
export const simS3SourceAccountConditionKey = "aws:SourceAccount";

/**
 * The per-request options every simulated S3 command accepts.
 *
 * This lives beside the commands rather than on the service facade so a command
 * area can name it without importing the facade back.
 */
export interface SimS3RequestOptions {
  /**
   * Who is making the request. An omitted caller is the Account root, as it is
   * everywhere else in the simulation.
   */
  readonly caller?: SimAwsCaller;

  /**
   * What the caller is reaching the Bucket for, supplied to IAM as
   * `aws:SourceArn`.
   *
   * This is for a simulated service making a request on a resource's behalf,
   * which is how real AWS supplies it. A value the caller does not have is left
   * out rather than supplied empty, so a statement conditioned on it fails to
   * match instead of matching an empty string.
   */
  readonly sourceArn?: string;

  /**
   * The Account owning the resource the caller is reaching the Bucket for,
   * supplied to IAM as `aws:SourceAccount`.
   *
   * Left out the same way when the caller has no value for it.
   */
  readonly sourceAccount?: string;
}
