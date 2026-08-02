import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimLambdaFunction } from "../../lambda/function/sim-lambda-function.js";
import type { SimHttpApiIntegration } from "../api/integration/sim-http-api-integration.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import type { SimHttpApiRegistry } from "../registry/sim-http-api-registry.js";

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
    this.registry = this.simAws.serviceFactory.httpApiRegistry;
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
   * Find the function an integration invokes.
   *
   * The function is looked up in the Account and Region its ARN names, not the
   * API's, because an integration ARN is free to name either.
   */
  functionFor(
    integration: SimHttpApiIntegration,
  ): SimLambdaFunction | undefined {
    const { accountId, regionName, functionName } = integration.lambdaUri;

    return this.simAws
      .accountRegionScope(
        accountId as SimAwsAccountId,
        regionName as AwsRegionName,
      )
      .lambda()
      .getSimFunctionByName(functionName);
  }
}
