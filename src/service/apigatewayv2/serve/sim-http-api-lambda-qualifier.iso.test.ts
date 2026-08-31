import {
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  AddPermissionCommand,
  PublishVersionCommand,
  UpdateAliasCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayEquals,
  assertNonNullable,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simLambdaAliasedFunction,
  simLambdaAllowAliasInvoke,
  type SimLambdaAliasedFunction,
} from "../../../../test/lambda/alias-fixture.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { simApiGatewayServicePrincipal } from "../../apigateway/sim-api-gateway-service-principal.js";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * What the handler behind every route here answers with. The version that ran
 * is recorded by the fixture rather than carried in the body, since a
 * published version is a copy of the function and answers the same way.
 */
const handled = {
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: "handled",
};

/**
 * An API serving one route from the function a URI names, with a stage to
 * serve it from.
 */
async function servedApi(
  simAws: SimAws,
  integrationUri: string,
): Promise<{ readonly apiId: string; readonly apiEndpoint: string }> {
  const apiGateway = simAws.apiGatewayV2();
  const { ApiId: apiId, ApiEndpoint: apiEndpoint } = await apiGateway.createApi(
    new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
  );
  const { IntegrationId: integrationId } = await apiGateway.createIntegration(
    new CreateIntegrationCommand({
      ApiId: apiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: integrationUri,
      PayloadFormatVersion: "2.0",
    }),
  );
  await apiGateway.createRoute(
    new CreateRouteCommand({
      ApiId: apiId,
      RouteKey: "$default",
      Target: `integrations/${integrationId}`,
    }),
  );
  await apiGateway.createStage(
    new CreateStageCommand({
      ApiId: apiId,
      StageName: "$default",
      AutoDeploy: true,
    }),
  );

  return { apiId, apiEndpoint };
}

/**
 * The `execute-api` ARN a grant for every route and stage of an API names.
 */
function apiSourceArn(simAws: SimAws, apiId: string): string {
  return `arn:aws:execute-api:${simAws.defaultRegionName}:${simAws.defaultAccountId}:${apiId}/*/*`;
}

function get(
  simAws: SimAws,
  apiEndpoint: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: apiEndpoint }).toString(),
    { headers },
  );
}

/**
 * A second published version of the fixture's function, which the alias can be
 * moved to.
 */
async function publishSecondVersion(
  simAws: SimAws,
  functionName: string,
): Promise<string> {
  const { Version } = await simAws
    .lambda()
    .publishVersion(new PublishVersionCommand({ FunctionName: functionName }));

  assertNonNullable(Version, "PublishVersion answered with a version");

  return Version;
}

describe("Serving a sim HTTP API route backed by a Lambda version or alias", () => {
  it("runs the version the integration's alias points at", async () => {
    // Given a route whose integration names an alias that admits the API
    const simAws = new SimAws();
    const orders = await aliasedOrders(simAws);
    const { apiId, apiEndpoint } = await servedApi(simAws, orders.aliasArn);
    await simLambdaAllowAliasInvoke(
      simAws,
      "orders",
      simApiGatewayServicePrincipal,
      apiSourceArn(simAws, apiId),
    );

    // When the route is requested
    const response = await get(simAws, apiEndpoint);

    // Then the version behind the alias served it, rather than $LATEST
    assertResponseStatus(response, 200, await describeResponse(response));
    assertArrayEquals(orders.ranAs, [orders.version]);
  });

  it("follows the alias after UpdateAlias moves it", async () => {
    // Given a route serving through the alias, and a second published version
    const simAws = new SimAws();
    const orders = await aliasedOrders(simAws);
    const { apiId, apiEndpoint } = await servedApi(simAws, orders.aliasArn);
    await simLambdaAllowAliasInvoke(
      simAws,
      "orders",
      simApiGatewayServicePrincipal,
      apiSourceArn(simAws, apiId),
    );
    const second = await publishSecondVersion(simAws, "orders");
    await get(simAws, apiEndpoint);

    // When the alias is moved to that version, with the API untouched
    await simAws.lambda().updateAlias(
      new UpdateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: second,
      }),
    );
    await get(simAws, apiEndpoint);

    // Then the route served the first version and now serves the second
    assertArrayEquals(orders.ranAs, [orders.version, second]);
  });

  it("runs the version an integration names by number", async () => {
    // Given a route naming a version number, in the API Gateway path form a
    // hand-written template writes
    const simAws = new SimAws();
    const orders = await aliasedOrders(simAws);
    const { apiId, apiEndpoint } = await servedApi(
      simAws,
      `arn:aws:apigateway:${simAws.defaultRegionName}:lambda:path/2015-03-31/` +
        `functions/${orders.functionArn}:${orders.version}/invocations`,
    );
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        Qualifier: orders.version,
        StatementId: "api-gateway-invoke",
        Action: "lambda:InvokeFunction",
        Principal: simApiGatewayServicePrincipal,
        SourceArn: apiSourceArn(simAws, apiId),
      }),
    );

    // When the route is requested
    const response = await get(simAws, apiEndpoint);

    // Then that version served it
    assertResponseStatus(response, 200, await describeResponse(response));
    assertArrayEquals(orders.ranAs, [orders.version]);
  });

  it("answers 500 when the grant was made on the function rather than the alias", async () => {
    // Given a route serving through an alias, with the invoke permission
    // granted on the function itself
    const simAws = new SimAws();
    const orders = await aliasedOrders(simAws);
    const { apiId, apiEndpoint } = await servedApi(simAws, orders.aliasArn);
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "orders",
        StatementId: "api-gateway-invoke",
        Action: "lambda:InvokeFunction",
        Principal: simApiGatewayServicePrincipal,
        SourceArn: apiSourceArn(simAws, apiId),
      }),
    );

    // When the route is requested
    const response = await get(simAws, apiEndpoint);

    // Then the call is refused, because the alias holds a policy of its own
    // and nothing was granted on it
    assertResponseStatus(response, 500, await describeResponse(response));
    assertArrayEquals(orders.ranAs, []);
  });

  it("answers 500 when the qualifier names no version and no alias", async () => {
    // Given a route whose integration names an alias nothing created
    const simAws = new SimAws();
    const orders = await aliasedOrders(simAws);
    const { apiId, apiEndpoint } = await servedApi(
      simAws,
      `${orders.functionArn}:staging`,
    );
    await simLambdaAllowAliasInvoke(
      simAws,
      "orders",
      simApiGatewayServicePrincipal,
      apiSourceArn(simAws, apiId),
    );

    // When the route is requested
    const response = await get(simAws, apiEndpoint);

    // Then the missing qualifier surfaces where a missing function does, at
    // the invocation rather than at the integration that named it
    assertResponseStatus(response, 500, await describeResponse(response));
    assertArrayEquals(orders.ranAs, []);
  });

  it("runs the version a REQUEST authorizer's alias points at", async () => {
    // Given a route behind an authorizer whose URI names an alias
    const simAws = new SimAws();
    const orders = await aliasedOrders(simAws);
    const authorizer = await simLambdaAliasedFunction(
      simAws,
      "session-authorizer",
      { result: () => ({ isAuthorized: true, context: { tenant: "acme" } }) },
    );
    const { apiId, apiEndpoint } = await servedApiWithAuthorizer(
      simAws,
      orders,
      authorizer.aliasArn,
    );
    await simLambdaAllowAliasInvoke(
      simAws,
      "orders",
      simApiGatewayServicePrincipal,
      apiSourceArn(simAws, apiId),
    );
    await simLambdaAllowAliasInvoke(
      simAws,
      "session-authorizer",
      simApiGatewayServicePrincipal,
      apiSourceArn(simAws, apiId),
    );

    // When the route is requested with the identity source the authorizer
    // reads
    const response = await get(simAws, apiEndpoint, {
      cookie: "session=valid",
    });

    // Then the published version behind the alias answered, not $LATEST
    assertResponseStatus(response, 200, await describeResponse(response));
    assertArrayEquals(authorizer.ranAs, [authorizer.version]);
    assertArrayEquals(orders.ranAs, [orders.version]);
  });
});

/**
 * The `orders` function every route here serves from, with a version behind
 * the alias `live`.
 */
async function aliasedOrders(
  simAws: SimAws,
): Promise<SimLambdaAliasedFunction> {
  return await simLambdaAliasedFunction(simAws, "orders", {
    result: () => handled,
  });
}

/**
 * An API whose one route goes through a `REQUEST` authorizer before it reaches
 * the integration.
 */
async function servedApiWithAuthorizer(
  simAws: SimAws,
  orders: SimLambdaAliasedFunction,
  authorizerUri: string,
): Promise<{ readonly apiId: string; readonly apiEndpoint: string }> {
  const apiGateway = simAws.apiGatewayV2();
  const { ApiId: apiId, ApiEndpoint: apiEndpoint } = await apiGateway.createApi(
    new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
  );
  const { IntegrationId: integrationId } = await apiGateway.createIntegration(
    new CreateIntegrationCommand({
      ApiId: apiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: orders.aliasArn,
      PayloadFormatVersion: "2.0",
    }),
  );
  const { AuthorizerId: authorizerId } = await apiGateway.createAuthorizer(
    new CreateAuthorizerCommand({
      ApiId: apiId,
      Name: "session",
      AuthorizerType: "REQUEST",
      AuthorizerUri: authorizerUri,
      AuthorizerPayloadFormatVersion: "2.0",
      EnableSimpleResponses: true,
      IdentitySource: ["$request.header.cookie"],
    }),
  );
  await apiGateway.createRoute(
    new CreateRouteCommand({
      ApiId: apiId,
      RouteKey: "$default",
      Target: `integrations/${integrationId}`,
      AuthorizationType: "CUSTOM",
      AuthorizerId: authorizerId,
    }),
  );
  await apiGateway.createStage(
    new CreateStageCommand({
      ApiId: apiId,
      StageName: "$default",
      AutoDeploy: true,
    }),
  );

  return { apiId, apiEndpoint };
}
