import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimPayload2Event } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import type { SimHttpApi } from "./sim-http-api.js";

/**
 * What a test asks for when it wants an HTTP API that serves something.
 */
export interface SimHttpApiLambdaProxyInput {
  readonly apiName: string;
  readonly functionName: string;
  readonly roleArn: string;
  /** The function code the API's one route hands every request to. */
  readonly handler: (event: SimPayload2Event) => unknown;
  readonly disableExecuteApiEndpoint: boolean;
  readonly stageVariables: Readonly<Record<string, string>>;
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
 * Everything is created in the default Account and Region of the simulated AWS
 * it is given. A test working in another scope sends the commands itself.
 */
export const simHttpApiLambdaProxyFactory = new AsyncMappedFactory<
  SimHttpApiLambdaProxyInput,
  SimHttpApi,
  SimAws
>(
  () => ({
    apiName: "orders",
    functionName: "orders",
    roleArn: "arn:aws:iam::111111111111:role/OrdersRole",
    handler: (): string => "hello",
    disableExecuteApiEndpoint: false,
    stageVariables: {},
  }),
  async (input, simAws) => {
    const { FunctionArn: functionArn } = await simAws.lambda().createFunction({
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

    await simApiGatewayV2.createRoute({
      input: {
        ApiId: apiId,
        RouteKey: "$default",
        Target: `integrations/${integrationId}`,
      },
    });

    await simApiGatewayV2.createStage({
      input: {
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
        StageVariables: input.stageVariables,
      },
    });

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
