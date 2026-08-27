import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimHttpApiIntegration } from "../api/integration/sim-http-api-integration.js";
import type { SimHttpApiLambdaUri } from "../api/integration/sim-http-api-lambda-uri.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import type { SimHttpApiRegistry } from "../registry/sim-http-api-registry.js";
import type { SimHttpApiFunctionTarget } from "./sim-http-api-function-target.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simScopeIamAuthZ } from "../../iam/authorize/sim-iam-region-auth-z.js";

interface SimApiGatewayV2RouterProperties {
  readonly simAws?: SimAws;
}

/**
 * Routes a served HTTP API request to the API behind it, and an integration to
 * the function behind that.
 *
 * The request hostname gives the API id and the region, but not the Account.
 * The registry supplies that missing hop. The integrated function is a second
 * hop again, because its ARN names its own Account and Region, which need not
 * be the API's.
 */
export class SimApiGatewayV2Router {
  /**
   * The simulation this router routes within.
   *
   * Exposed so collaborators that need the same simulation, such as the clock
   * stamping invocation events, take it from here rather than being given a
   * second SimAws that could be a different one.
   */
  public readonly simAws: SimAws;

  private readonly registry: SimHttpApiRegistry;

  constructor(properties: SimApiGatewayV2RouterProperties = {}) {
    this.simAws = properties.simAws ?? new SimAws();
    this.registry = this.simAws.serviceFactory.registries.httpApi;
  }

  /**
   * Find the API a request target addresses.
   */
  route(target: SimAwsServiceTarget): SimHttpApi | undefined {
    const accountId = this.registry.accountIdForApi(target.resourceName);

    if (accountId === undefined) {
      return undefined;
    }

    return this.simAws
      .accountRegionScope(accountId, target.regionName)
      .apiGatewayV2()
      .findApi(target.resourceName);
  }

  /**
   * IAM of the Account that owns an API, which is what an `AWS_IAM` route's
   * authorization is evaluated against.
   *
   * It is the API's own Account rather than the caller's, so a caller from
   * elsewhere is decided by the API's Account the way any cross-Account
   * request is.
   */
  iamFor(api: SimHttpApi): SimIamInterServiceAuthZ {
    const { accountId, regionName } = api.accountRegionScope;

    return simScopeIamAuthZ(
      this.simAws.accountRegionScope(accountId, regionName),
    );
  }

  /**
   * Find the function an integration invokes, and the IAM deciding whether it
   * may be invoked.
   */
  targetFor(
    integration: SimHttpApiIntegration,
  ): SimHttpApiFunctionTarget | undefined {
    return this.functionFor(integration.lambdaUri);
  }

  /**
   * Find the function a URI names, and the IAM deciding whether API Gateway
   * may invoke it.
   *
   * The function is looked up in the Account and Region its own ARN names, not
   * the API's, because an integration URI and an authorizer URI are each free
   * to name either.
   *
   * A version or alias qualifier on the URI is resolved here, once per
   * request. A route built on an alias runs whichever version the alias points
   * at now. A qualifier naming neither a version nor an alias answers with
   * nothing, the way a function that was never created does. Both are
   * invocation-time failures on real AWS.
   *
   * The target carries the resource the URI named as well as the version that
   * runs. They differ for an alias, and the grant admitting the call was made
   * on the alias.
   */
  functionFor(
    lambdaUri: SimHttpApiLambdaUri,
  ): SimHttpApiFunctionTarget | undefined {
    const scope = this.simAws.accountRegionScope(
      lambdaUri.accountId as SimAwsAccountId,
      lambdaUri.regionName as AwsRegionName,
    );
    const target = scope
      .lambda()
      .getSimFunctionTarget(lambdaUri.functionName, lambdaUri.qualifier);

    return target === undefined
      ? undefined
      : { ...target, iam: simScopeIamAuthZ(scope) };
  }
}
