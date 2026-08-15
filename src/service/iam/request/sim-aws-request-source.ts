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
   * empty string. A header present but empty is the same thing said a
   * different way, and is read the same, since no AWS service names a resource
   * by sending nothing.
   */
  static fromHeaders(headers: Headers): SimAwsRequestSource | undefined {
    const arn = stated(headers.get(simAwsSourceArnHeaderName));
    const accountId = stated(headers.get(simAwsSourceAccountHeaderName));

    if (arn === undefined && accountId === undefined) {
      return undefined;
    }

    return new SimAwsRequestSource({ arn, accountId });
  }
}

/**
 * One header value, or nothing when the request did not really state it.
 */
function stated(value: string | null): string | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined;
  }

  return value;
}
