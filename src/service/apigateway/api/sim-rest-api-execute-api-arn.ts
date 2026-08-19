import type { SimRestApiMatch } from "./match/sim-rest-api-match.js";
import type { SimRestApi } from "./sim-rest-api.js";

interface SimRestApiExecuteApiArnProperties {
  readonly restApi: SimRestApi;
  readonly stageName: string;
  /** The method and path part, such as `GET/orders/{orderId}`. */
  readonly methodAndPath: string;
}

/**
 * The `execute-api` ARN of one request to a REST API.
 *
 * ```text
 * arn:aws:execute-api:<region>:<account>:<apiId>/<stage>/<METHOD>/<path>
 * ```
 *
 * This is the `SourceArn` an `AWS::Lambda::Permission` for a proxy integration
 * is granted on, and it is the same shape an HTTP API uses. What differs is
 * the last part. A REST API names the resource path template with its braces
 * intact, which is the form CDK's `arnForExecuteApi` writes, while an HTTP API
 * names a route key.
 *
 * The method segment carries the verb the client used rather than the `ANY` a
 * resource may have declared. CDK wildcards that segment, and a concrete verb
 * matches a wildcard where a literal `ANY` would not, so this is the reading
 * that keeps a CDK-deployed API working.
 *
 * Three things want this ARN and they fill the last part differently:
 *
 * - the invoke permission a Lambda integration is authorized against, where
 *   the path is the matched resource's template with its braces intact;
 * - the `methodArn` a Lambda authorizer is handed, and the resource the policy
 *   it answers with is evaluated against, where the path is the one the client
 *   asked for;
 * - the ARN API Gateway invokes an authorizer's own function under, which
 *   names the authorizer and no stage at all.
 */
export class SimRestApiExecuteApiArn {
  private readonly restApi: SimRestApi;
  private readonly stageName: string;
  private readonly methodAndPath: string;

  constructor(properties: SimRestApiExecuteApiArnProperties) {
    this.restApi = properties.restApi;
    this.stageName = properties.stageName;
    this.methodAndPath = properties.methodAndPath;
  }

  /**
   * The ARN of the method a request matched.
   */
  static forMatch(
    restApi: SimRestApi,
    match: SimRestApiMatch,
    requestMethod: string,
  ): SimRestApiExecuteApiArn {
    return new SimRestApiExecuteApiArn({
      restApi,
      stageName: match.stage.stageName,
      // The resource path carries a leading separator and the ARN supplies its
      // own, so a root-resource request reads `<apiId>/<stage>/GET/`.
      methodAndPath: `${requestMethod}${match.resource.path}`,
    });
  }

  /**
   * The ARN of the request a client made, which is the `methodArn` a Lambda
   * authorizer is handed.
   *
   * This names the concrete path rather than the resource template, so an
   * authorizer behind a `{proxy+}` sees the path that was asked for. The
   * policy it answers with is evaluated against this same ARN, which is why an
   * authorizer allowing one path leaves another unauthorized.
   */
  static forRequest(
    restApi: SimRestApi,
    match: SimRestApiMatch,
    requestMethod: string,
  ): SimRestApiExecuteApiArn {
    return new SimRestApiExecuteApiArn({
      restApi,
      stageName: match.stage.stageName,
      methodAndPath: `${requestMethod.toUpperCase()}/${match.pathAfterStage}`,
    });
  }

  /**
   * The ARN API Gateway invokes one of an API's authorizers under.
   *
   * ```text
   * arn:aws:execute-api:<region>:<account>:<apiId>/authorizers/<authorizerId>
   * ```
   *
   * This is the `SourceArn` AWS documents for granting API Gateway permission
   * to invoke a Lambda authorizer's function, and it names no stage. An
   * authorizer belongs to the API rather than to anything serving a request. A
   * function integrated behind a method and used as that method's authorizer
   * therefore needs two permissions, as it does on AWS.
   */
  static forAuthorizer(
    restApi: SimRestApi,
    authorizerId: string,
  ): SimRestApiExecuteApiArn {
    return new SimRestApiExecuteApiArn({
      restApi,
      stageName: "authorizers",
      methodAndPath: authorizerId,
    });
  }

  /**
   * The ARN as a permission or a policy names it.
   */
  toString(): string {
    const { accountId, regionName } = this.restApi.accountRegionScope;

    return (
      `arn:aws:execute-api:${regionName}:${accountId}:` +
      `${this.restApi.apiId}/${this.stageName}/${this.methodAndPath}`
    );
  }
}
