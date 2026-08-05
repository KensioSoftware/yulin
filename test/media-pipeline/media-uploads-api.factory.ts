import {
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import { AddPermissionCommand } from "@aws-sdk/client-lambda";
import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimHttpApi } from "../../src/service/apigatewayv2/api/sim-http-api.js";

/**
 * One route of the API, and the function it proxies to.
 */
export interface MediaUploadsApiRoute {
  readonly routeKey: string;
  readonly functionName: string;
  readonly functionArn: string;
}

/**
 * What the pipeline asks for when it wants the API its users call.
 */
export interface MediaUploadsApiInput {
  readonly apiName: string;
  /** The user pool whose tokens every route accepts. */
  readonly issuerUrl: string;
  /** The app client those tokens are for. */
  readonly audience: string;
  readonly routes: readonly MediaUploadsApiRoute[];
}

/**
 * Creates the HTTP API the pipeline's users call, with every route behind the
 * user pool.
 *
 * ```typescript
 * const api = await mediaUploadsApiFactory.make(
 *   { issuerUrl, audience: clientId, routes },
 *   simAws,
 * );
 * ```
 *
 * Each route gets its own integration and its own invoke permission, because
 * each one proxies to a different function. Putting every route behind the
 * authorizer is what makes the user id the functions work from one the
 * authorizer took out of a token rather than one the caller asked for.
 *
 * `simHttpApiLambdaProxyFactory` covers an API whose routes all reach one
 * function. This one exists because the pipeline's do not.
 */
export const mediaUploadsApiFactory = new AsyncMappedFactory<
  MediaUploadsApiInput,
  SimHttpApi,
  SimAws
>(
  () => ({ apiName: "images", issuerUrl: "", audience: "", routes: [] }),
  async (input, simAws) => {
    const apiGateway = simAws.apiGatewayV2();

    const created = await apiGateway.createApi(
      new CreateApiCommand({ Name: input.apiName, ProtocolType: "HTTP" }),
    );
    assertNonNullable(created.ApiId, "CreateApi answered with an API id");
    const apiId = created.ApiId;

    const authorizer = await apiGateway.createAuthorizer(
      new CreateAuthorizerCommand({
        ApiId: apiId,
        Name: "user-pool-authorizer",
        AuthorizerType: "JWT",
        IdentitySource: ["$request.header.Authorization"],
        JwtConfiguration: {
          Issuer: input.issuerUrl,
          Audience: [input.audience],
        },
      }),
    );
    const authorizerId = authorizer.AuthorizerId;
    assertNonNullable(authorizerId, "CreateAuthorizer answered with an id");

    await Promise.all(
      input.routes.map(async (route) =>
        createProxyRoute(simAws, apiId, authorizerId, route),
      ),
    );

    await apiGateway.createStage(
      new CreateStageCommand({
        ApiId: apiId,
        StageName: "$default",
        AutoDeploy: true,
      }),
    );

    const api = apiGateway.findApi(apiId);
    assertNonNullable(api, `Simulated API Gateway holds ${apiId}`);

    return api;
  },
);

/**
 * Create one authorized route proxying to one function, and let the API invoke
 * it.
 */
async function createProxyRoute(
  simAws: SimAws,
  apiId: string,
  authorizerId: string,
  route: MediaUploadsApiRoute,
): Promise<void> {
  const apiGateway = simAws.apiGatewayV2();

  const integration = await apiGateway.createIntegration(
    new CreateIntegrationCommand({
      ApiId: apiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: route.functionArn,
      PayloadFormatVersion: "2.0",
    }),
  );
  assertNonNullable(
    integration.IntegrationId,
    "CreateIntegration answered with an id",
  );

  await apiGateway.createRoute(
    new CreateRouteCommand({
      ApiId: apiId,
      RouteKey: route.routeKey,
      Target: `integrations/${integration.IntegrationId}`,
      AuthorizationType: "JWT",
      AuthorizerId: authorizerId,
    }),
  );

  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: route.functionName,
      StatementId: "AllowApiGatewayInvoke",
      Action: "lambda:InvokeFunction",
      Principal: "apigateway.amazonaws.com",
      SourceArn: `arn:aws:execute-api:${simAws.defaultRegionName}:${simAws.defaultAccountId}:${apiId}/*/*`,
    }),
  );
}
