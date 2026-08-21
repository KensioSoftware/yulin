import type { AwsRegionName } from "../../../aws/sim-aws-region.js";

/**
 * The SES identity a pool's `SourceArn` names.
 *
 * The account the ARN was written with is deliberately absent. A `SourceArn`
 * synthesized by CDK carries the account the stack deploys to, which is a real
 * one, while a simulation usually runs under the default simulated account. A
 * pool resolves its identity in its own account, so the region and the
 * identity name are what have to meet and the account id in the ARN is read
 * past. Keying on the whole ARN instead would leave every project rewriting
 * the account id in its template before a sign-up could send.
 */
export interface SimCognitoEmailSourceIdentity {
  /**
   * The region the identity is verified in, which is the region of the SES
   * the pool sends through. Real Cognito restricts which regions a pool may
   * pair with; nothing here does, so a pool reaches any region's SES.
   */
  readonly regionName: AwsRegionName;

  /** The address or domain, as the ARN spelled it. */
  readonly identityName: string;

  /**
   * Whether the identity is a domain rather than one address.
   *
   * SES decides this by whether the name has an `@` in it, and so does this.
   * A domain has no address for Cognito to send as, which is why a pool
   * naming one has to say what its `From` is.
   */
  readonly isDomain: boolean;
}

/**
 * `arn:aws:ses:<region>:<account>:identity/<name>`, which is the only SES ARN
 * a `SourceArn` is allowed to be.
 *
 * The account segment is held to digits the way the AWS pattern holds it, even
 * though the value is read past. A malformed ARN is worth refusing whether or
 * not this goes on to use the part that is malformed.
 */
const identityArnPattern = /^arn:[^:]*:ses:([^:]+):[0-9]+:identity\/(.+)$/;

/**
 * Read the SES identity out of a pool's `SourceArn`, or nothing where the
 * value names something else.
 *
 * A caller refusing the value is what turns `undefined` into an error, because
 * the two commands that carry a `SourceArn` word their refusals differently.
 */
export function simCognitoEmailSourceIdentity(
  sourceArn: string,
): SimCognitoEmailSourceIdentity | undefined {
  const parts = identityArnPattern.exec(sourceArn);
  const regionName = parts?.[1];
  const identityName = parts?.[2];

  if (regionName === undefined || identityName === undefined) {
    return undefined;
  }

  // Read as a region name the way every other ARN parser here reads one. A
  // spelling no region has resolves to a scope with nothing in it, and the
  // pool then reports the identity as missing, which is what it is.
  return {
    regionName: regionName as AwsRegionName,
    identityName,
    isDomain: !identityName.includes("@"),
  };
}
