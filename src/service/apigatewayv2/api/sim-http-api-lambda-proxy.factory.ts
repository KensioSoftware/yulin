import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "../../aws/sim-aws-account.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { simApiGatewayServicePrincipal } from "../serve/auth/sim-http-api-integration-authorizer.js";
import type { SimHttpApi } from "./sim-http-api.js";

/**
 * What a test asks for when it wants an HTTP API that serves something.
 */
export interface SimHttpApiLambdaProxyInput {
  readonly apiName: string;
  readonly functionName: string;
  /**
   * The Account the function belongs to, which need not be the API's: an
   * integration URI is free to name another one.
   */
  readonly functionAccountId: string;
  readonly roleArn: string;
  /** The function code every route of the API hands its requests to. */
  readonly handler: (event: SimPayload2Event) => unknown;
  readonly disableExecuteApiEndpoint: boolean;
  /** The route keys the API routes, all onto the one integration. */
  readonly routeKeys: readonly string[];
  /** The stages the API serves from. */
  readonly stageNames: readonly string[];
  /** The variables every one of those stages carries. */
  readonly stageVariables: Readonly<Record<string, string>>;
  /**
   * Whether the function grants the API permission to invoke it, which it
   * needs before any route serves anything.
   *
   * The grant is the one CDK writes: `apigateway.amazonaws.com` may
   * `lambda:InvokeFunction` for any stage and route of this API. A test about
   * the permission itself turns this off and grants what it means to test.
   */
  readonly invokePermission: boolean;
}

/**
 * Creates an HTTP API that proxies every request to a simulated Lambda
 * function, through the ordinary commands.
 *
 * Four commands and a function stand between a test and a request it can
 * serve, and a test about serving is about none of them. Tests about the
 * commands themselves send them one at a time instead.
 *
 * ```typescript
 * const api = await simHttpApiLambdaProxyFactory.make(
 *   { handler: () => "hello" },
 *   simAws,
 * );
 * const response = await new SimAwsHttp({ simAws }).fetch(
 *   new SimAwsLocalUrl({ input: api.apiEndpoint }).toString(),
 * );
 * ```
 *
 * The API is created in the default Account and Region of the simulated AWS it
 * is given, and so is the function unless another Account is asked for. A test
 * working in another scope sends the commands itself.
 */
export const simHttpApiLambdaProxyFactory = new AsyncMappedFactory<
  SimHttpApiLambdaProxyInput,
  SimHttpApi,
  SimAws
>(
  () => ({
    apiName: "orders",
    functionName: "orders",
    functionAccountId: DEFAULT_SIM_AWS_ACCOUNT_ID,
    roleArn: "arn:aws:iam::111111111111:role/OrdersRole",
    handler: (): string => "hello",
    disableExecuteApiEndpoint: false,
    routeKeys: ["$default"],
    stageNames: ["$default"],
    stageVariables: {},
    invokePermission: true,
  }),
  async (input, simAws) => {
    const simLambda = simAws.account(input.functionAccountId).lambda();
    const { FunctionArn: functionArn } = await simLambda.createFunction({
      input: {
        FunctionName: input.functionName,
        Role: input.roleArn,
        Code: { ZipFile: makeLambdaZipFileInput(input.handler) },
      },
    });

    const simApiGatewayV2 = simAws.apiGatewayV2();
    const { ApiId: apiId } = await simApiGatewayV2.createApi({
      input: {
        Name: input.apiName,
        ProtocolType: "HTTP",
        DisableExecuteApiEndpoint: input.disableExecuteApiEndpoint,
      },
    });

    const { IntegrationId: integrationId } =
      await simApiGatewayV2.createIntegration({
        input: {
          ApiId: apiId,
          IntegrationType: "AWS_PROXY",
          IntegrationUri: functionArn,
          PayloadFormatVersion: "2.0",
        },
      });

    await Promise.all(
      input.routeKeys.map(async (routeKey) =>
        simApiGatewayV2.createRoute({
          input: {
            ApiId: apiId,
            RouteKey: routeKey,
            Target: `integrations/${integrationId}`,
          },
        }),
      ),
    );

    if (input.invokePermission) {
      // The ARN names the API's own Account and Region, which is where the
      // request arrives, whatever Account the function belongs to.
      const { accountId, regionName } =
        simAws.accountRegionScope().accountRegionScope;
      await simLambda.addPermission({
        input: {
          FunctionName: input.functionName,
          StatementId: "api-gateway-invoke",
          Action: "lambda:InvokeFunction",
          Principal: simApiGatewayServicePrincipal,
          SourceArn: `arn:aws:execute-api:${regionName}:${accountId}:${apiId}/*/*`,
        },
      });
    }

    await Promise.all(
      input.stageNames.map(async (stageName) =>
        simApiGatewayV2.createStage({
          input: {
            ApiId: apiId,
            StageName: stageName,
            AutoDeploy: true,
            StageVariables: input.stageVariables,
          },
        }),
      ),
    );

    // An id CreateApi allocated is an API the store holds, so this is only
    // missing if something is wrong with the simulator itself.
    const api = simApiGatewayV2.findApi(apiId);
    assertDefined(
      api,
      `Simulated API Gateway created the API ${apiId} and then did not hold it`,
    );

    return api;
  },
);
