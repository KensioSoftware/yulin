import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaFunction } from "../function/sim-lambda-function.js";
import type {
  SimLambdaFunctionUrl,
  SimLambdaFunctionUrlId,
} from "../function/url/sim-lambda-function-url.js";
import type { SimLambdaUrlRegistry } from "../registry/sim-lambda-url-registry.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";

export interface SimLambdaFunctionUrlRoute {
  readonly functionUrl: SimLambdaFunctionUrl;
  readonly simFunction: SimLambdaFunction;
  /**
   * IAM of the Account that owns the function, which is what an `AWS_IAM`
   * Function URL evaluates its invoke permission against.
   */
  readonly iam: SimIamInterServiceAuthZ;
}

interface SimLambdaUrlRouterProperties {
  readonly simAws?: SimAws;
  readonly urlRegistry?: SimLambdaUrlRegistry;
}

/**
 * Routes a served Function URL request to the function behind it.
 *
 * The request hostname gives the URL id and the region, but not the Account.
 * The registry supplies that missing hop, and the Account/Region scope it
 * names owns the Function URL and the function.
 */
export class SimLambdaUrlRouter {
  /**
   * The simulation this router routes within.
   *
   * Exposed so collaborators that need the same simulation, such as the clock
   * stamping invocation events, take it from here rather than being given a
   * second SimAws that could be a different one.
   */
  public readonly simAws: SimAws;

  private readonly urlRegistry: SimLambdaUrlRegistry;

  constructor(properties: SimLambdaUrlRouterProperties = {}) {
    this.simAws = properties.simAws ?? new SimAws();
    this.urlRegistry =
      properties.urlRegistry ?? this.simAws.serviceFactory.lambdaUrlRegistry;
  }

  /**
   * Find the Function URL and function a request target addresses.
   */
  route(target: SimAwsServiceTarget): SimLambdaFunctionUrlRoute | undefined {
    const urlId = target.resourceName as SimLambdaFunctionUrlId;
    const accountId = this.urlRegistry.accountIdForFunctionUrl(urlId);

    if (accountId === undefined) {
      return undefined;
    }

    const scope = this.simAws.accountRegionScope(accountId, target.regionName);
    const lambda = scope.lambda();
    const functionUrl = lambda.getSimFunctionUrlById(urlId);

    if (functionUrl === undefined) {
      return undefined;
    }

    const simFunction = lambda.getSimFunctionByName(functionUrl.functionName);

    /* v8 ignore if -- defensive check: a URL cannot outlive its function */
    if (simFunction === undefined) {
      return undefined;
    }

    return { functionUrl, simFunction, iam: scope.iam() };
  }
}
