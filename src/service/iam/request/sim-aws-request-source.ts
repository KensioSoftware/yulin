/**
 * The header naming the AWS resource a request is being made on behalf of.
 *
 * When one AWS service calls another it says what it is calling for, and IAM
 * supplies that as `aws:SourceArn`. A resource policy granting a service
 * principal is normally conditioned on it, so that a Distribution or a Bucket
 * can be granted rather than the whole service. Nothing about an HTTP request
 * arriving in process says any of that, so the caller states it the same way it
 * states who it is.
 */
export const simAwsSourceArnHeaderName = "x-sim-aws-source-arn";

/**
 * The header naming the Account owning the resource the request is made on
 * behalf of, supplied by IAM as `aws:SourceAccount`.
 */
export const simAwsSourceAccountHeaderName = "x-sim-aws-source-account";

interface SimAwsRequestSourceProperties {
  readonly arn?: string | undefined;
  readonly accountId?: string | undefined;
}

/**
 * What a request says it is being made on behalf of.
 *
 * This is separate from the caller: the caller is who is asking, and this is
 * which of their resources they are asking for. Only a service principal has
 * one in practice, since that is the case AWS supplies the condition keys for.
 */
export class SimAwsRequestSource {
  public readonly arn: string | undefined;
  public readonly accountId: string | undefined;

  constructor(properties: SimAwsRequestSourceProperties) {
    this.arn = properties.arn;
    this.accountId = properties.accountId;
  }

  /**
   * Read the source a request states, or nothing when it states none.
   *
   * A request carrying neither header has no source rather than an empty one,
   * so a policy conditioned on either fails to match instead of matching an
   * empty string.
   */
  static fromHeaders(headers: Headers): SimAwsRequestSource | undefined {
    const arn = headers.get(simAwsSourceArnHeaderName) ?? undefined;
    const accountId = headers.get(simAwsSourceAccountHeaderName) ?? undefined;

    if (arn === undefined && accountId === undefined) {
      return undefined;
    }

    return new SimAwsRequestSource({ arn, accountId });
  }
}
