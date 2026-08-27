import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimRestApiLambdaUri } from "../api/method/sim-rest-api-lambda-uri.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import type { SimRestApiRegistry } from "../registry/sim-rest-api-registry.js";
import type { SimRestApiFunctionTarget } from "./sim-rest-api-function-target.js";
import { simScopeIamAuthZ } from "../../iam/authorize/sim-iam-region-auth-z.js";

interface SimApiGatewayRouterProperties {
  readonly simAws?: SimAws;
}

/**
 * Routes a served REST API request to the API behind it, and an integration to
 * the function behind that.
 *
 * The request hostname gives the API id and the Region, and not the Account.
 * The registry supplies that missing hop. The integrated function is a second
 * hop again, because its ARN names its own Account and Region, which need not
 * be the API's.
 */
export class SimApiGatewayRouter {
  /**
   * The simulation this router routes within.
   *
   * Exposed so collaborators needing the same simulation, such as the clock
   * stamping invocation events, take it from here rather than being given a
   * second SimAws that could be a different one.
   */
  public readonly simAws: SimAws;

  private readonly registry: SimRestApiRegistry;

  constructor(properties: SimApiGatewayRouterProperties = {}) {
    this.simAws = properties.simAws ?? new SimAws();
    this.registry = this.simAws.serviceFactory.registries.restApi;
  }

  /**
   * Find the REST API a request target addresses.
   */
  route(target: SimAwsServiceTarget): SimRestApi | undefined {
    const accountId = this.registry.accountIdForApi(target.resourceName);

    if (accountId === undefined) {
      return undefined;
    }

    return this.simAws
      .accountRegionScope(accountId, target.regionName)
      .apiGateway()
      .findRestApi(target.resourceName);
  }

  /**
   * The IAM that decides an `AWS_IAM` method of one API.
   *
   * It is the IAM of the Account that owns the API, which is where the
   * policies allowing a caller `execute-api:Invoke` on its methods live.
   */
  iamFor(restApi: SimRestApi): SimIamInterServiceAuthZ {
    const { accountId, regionName } = restApi.accountRegionScope;

    return simScopeIamAuthZ(
      this.simAws.accountRegionScope(accountId, regionName),
    );
  }

  /**
   * Find the function a URI names, and the IAM deciding whether API Gateway
   * may invoke it.
   *
   * The function is looked up in the Account and Region its own ARN names,
   * rather than the API's, because an integration URI is free to name either.
   *
   * A version or alias qualifier on the URI is resolved here, once per
   * request, so a method built on an alias runs whichever version the alias
   * points at now. A qualifier naming neither answers with nothing, the way a
   * function that was never created does.
   */
  functionFor(
    lambdaUri: SimRestApiLambdaUri,
  ): SimRestApiFunctionTarget | undefined {
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
