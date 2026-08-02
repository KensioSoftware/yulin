import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimIamActionAuthorizer } from "../../../iam/authorize/sim-iam-action-authorizer.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";

/**
 * The HTTP methods the API Gateway control plane authorizes against.
 */
export type SimApiGatewayV2Method = "GET" | "POST" | "DELETE";

interface SimApiGatewayV2AuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to API Gateway control-plane commands.
 *
 * API Gateway is unusual in what it asks IAM: the action is the HTTP method of
 * the underlying REST call, `apigateway:POST` and friends, not a name matching
 * the SDK operation, and the resource is the request path rather than an ARN
 * naming a resource type. So `CreateRoute` on API `a1b2c3d4e5` asks whether
 * the caller may `apigateway:POST` on
 * `arn:aws:apigateway:<region>::/apis/a1b2c3d4e5/routes`. A policy written the
 * way policies for other services are written matches nothing here, as it
 * matches nothing on real AWS.
 *
 * Those ARNs carry no Account id. That is not an omission: API Gateway
 * control-plane ARNs leave the Account segment empty.
 */
export class SimApiGatewayV2Authorizer {
  private readonly actions: SimIamActionAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimApiGatewayV2AuthorizerProperties) {
    this.actions = new SimIamActionAuthorizer({ iam: properties.iam });
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may make a request to an API Gateway resource path.
   *
   * The resource need not exist. Real IAM evaluates a request before the
   * service handles it, so a caller with no permission is refused whether or
   * not the API is there, and CreateApi authorizes against the collection it
   * is about to add to.
   */
  authorize(
    method: SimApiGatewayV2Method,
    resourcePath: string,
    caller?: SimAwsCaller,
  ): void {
    this.actions.authorize(
      `apigateway:${method}`,
      `arn:aws:apigateway:${this.accountRegionScope.regionName}::${resourcePath}`,
      caller,
    );
  }
}
