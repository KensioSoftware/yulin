import type { SimHttpApi } from "./sim-http-api.js";

interface SimHttpApiExecuteApiArnProperties {
  readonly api: SimHttpApi;
  readonly stageName: string;
  /**
   * The method and path part of the ARN, such as `GET/orders/{orderId}` or
   * the literal `$default`.
   */
  readonly methodAndPath: string;
}

/**
 * The `execute-api` ARN of one request to an API.
 *
 * ```text
 * arn:aws:execute-api:<region>:<account>:<apiId>/<stage>/<METHOD>/<path>
 * ```
 *
 * Two things want this ARN and they fill the last part differently:
 *
 * - the invoke permission a Lambda integration is authorized against, where
 *   the path is the matched route key's template with its braces intact,
 *   because that is the form a permission's `SourceArn` is written in;
 * - `AWS_IAM` route authorization, where the path is the path the request
 *   asked for, because that is the resource the caller is acting on.
 *
 * Neither part is documented by AWS as the value API Gateway supplies. The
 * path is the better supported of the two: CDK synthesises a `SourceArn`
 * whose stage and method segments are wildcards and whose path segments are
 * the route key template, braces and all. IAM wildcard matching treats a brace
 * as a literal, so a concrete request path could never match a permission
 * written that way.
 *
 * The method is weaker. AWS's CLI example for granting an `ANY /test` route on
 * the `prod` stage wildcards the method segment, which shows what a permission
 * may say rather than what API Gateway puts there. A concrete verb matches
 * such a pattern, while a permission written with a literal `ANY` would not
 * match a concrete verb, so the concrete verb is the reading that keeps a
 * CDK-deployed route working.
 */
export class SimHttpApiExecuteApiArn {
  private readonly api: SimHttpApi;
  private readonly stageName: string;
  private readonly methodAndPath: string;

  constructor(properties: SimHttpApiExecuteApiArnProperties) {
    this.api = properties.api;
    this.stageName = properties.stageName;
    this.methodAndPath = properties.methodAndPath;
  }

  /**
   * The ARN as a permission or a policy names it.
   */
  toString(): string {
    const { accountId, regionName } = this.api.accountRegionScope;

    return (
      `arn:aws:execute-api:${regionName}:${accountId}:` +
      `${this.api.apiId}/${this.stageName}/${this.methodAndPath}`
    );
  }
}
