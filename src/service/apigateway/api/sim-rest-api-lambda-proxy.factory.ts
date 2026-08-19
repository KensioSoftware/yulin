import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimPayload1Event } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "../../aws/sim-aws-account.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { declaredMethods } from "./sim-rest-api-declared-method.js";
import {
  simRestApiInvokePermission,
  simRestApiProxyFunction,
} from "./sim-rest-api-proxy-function.js";
import type { SimRestApi } from "./sim-rest-api.js";

/**
 * What a test asks for when it wants a REST API that serves something.
 */
export interface SimRestApiLambdaProxyInput {
  readonly apiName: string;
  readonly functionName: string;
  /**
   * The Account the function belongs to, which need not be the API's: an
   * integration URI is free to name another one.
   */
  readonly functionAccountId: string;
  readonly roleArn: string;
  /** The function code every method of the API hands its requests to. */
  readonly handler: (event: SimPayload1Event) => unknown;
  readonly disableExecuteApiEndpoint: boolean;
  /**
   * The resource paths the API declares, written as templates such as
   * `/orders/{orderId}` or `/{proxy+}`. Each one gets the method below.
   */
  readonly resourcePaths: readonly string[];
  /** The HTTP method declared on each of those resources. */
  readonly httpMethod: string;
  /** The stage the API is deployed to, which every request goes through. */
  readonly stageName: string;
  /** The variables that stage carries. */
  readonly stageVariables: Readonly<Record<string, string>>;
  /**
   * Whether the function grants the API permission to invoke it, which it
   * needs before any method serves anything.
   *
   * The grant is the one CDK writes: `apigateway.amazonaws.com` may
   * `lambda:InvokeFunction` for any stage and method of this API. A test about
   * the permission itself turns this off and grants what it means to test.
   */
  readonly invokePermission: boolean;
}

/**
 * Creates a REST API that proxies every request to a simulated Lambda
 * function, through the ordinary commands.
 *
 * A resource per path segment, a method, an integration, a deployment and a
 * function stand between a test and a request it can serve, and a test about
 * serving is about none of them. Tests about the commands themselves send them
 * one at a time instead.
 *
 * ```typescript
 * const restApi = await simRestApiLambdaProxyFactory.make(
 *   { handler: () => ({ statusCode: 200, body: "hello" }) },
 *   simAws,
 * );
 * const response = await new SimAwsHttp({ simAws }).fetch(
 *   new SimAwsLocalUrl({ input: restApi.invokeUrl("prod") }).toString(),
 * );
 * ```
 *
 * The API is created in the default Account and Region of the simulated AWS it
 * is given, and so is the function unless another Account is asked for.
 */
export const simRestApiLambdaProxyFactory = new AsyncMappedFactory<
  SimRestApiLambdaProxyInput,
  SimRestApi,
  SimAws
>(
  () => ({
    apiName: "orders",
    functionName: "orders",
    functionAccountId: DEFAULT_SIM_AWS_ACCOUNT_ID,
    roleArn: "arn:aws:iam::111111111111:role/OrdersRole",
    handler: (): unknown => ({ statusCode: 200, body: "hello" }),
    disableExecuteApiEndpoint: false,
    resourcePaths: ["/{proxy+}"],
    httpMethod: "ANY",
    stageName: "prod",
    stageVariables: {},
    invokePermission: true,
  }),
  async (input, simAws) => {
    const functionArn = await simRestApiProxyFunction(simAws, input);
    const apiGateway = simAws.apiGateway();
    const created = await apiGateway.createRestApi({
      input: {
        name: input.apiName,
        disableExecuteApiEndpoint: input.disableExecuteApiEndpoint,
      },
    });
    const restApiId = created.id;

    await declaredMethods(apiGateway, input.resourcePaths, {
      restApiId,
      rootResourceId: created.rootResourceId,
      httpMethod: input.httpMethod,
      functionArn,
    });

    if (input.invokePermission) {
      await simRestApiInvokePermission(simAws, input, restApiId);
    }

    await apiGateway.createDeployment({
      input: {
        restApiId,
        stageName: input.stageName,
        variables: input.stageVariables,
      },
    });

    // An id CreateRestApi allocated is an API the store holds, so this is only
    // missing if something is wrong with the simulator itself.
    const restApi = apiGateway.findRestApi(restApiId);
    assertDefined(
      restApi,
      `Simulated API Gateway created the API ${restApiId} and then did not hold it`,
    );

    return restApi;
  },
);
