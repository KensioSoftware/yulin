/**
 * Deleting a route, an integration and a stage from a simulated HTTP API.
 */

import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
  DeleteIntegrationCommand,
  DeleteRouteCommand,
  DeleteStageCommand,
  GetIntegrationsCommand,
  GetRoutesCommand,
} from "@aws-sdk/client-apigatewayv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const apiGateway = simAws.apiGatewayV2();

const { ApiId } = await apiGateway.createApi(
  new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
);

const { IntegrationId } = await apiGateway.createIntegration(
  new CreateIntegrationCommand({
    ApiId,
    IntegrationType: "AWS_PROXY",
    IntegrationUri: "arn:aws:lambda:eu-west-2:111111111111:function:orders",
    PayloadFormatVersion: "2.0",
  }),
);

const { RouteId } = await apiGateway.createRoute(
  new CreateRouteCommand({
    ApiId,
    RouteKey: "GET /orders",
    Target: `integrations/${IntegrationId}`,
  }),
);

await apiGateway.createStage(
  new CreateStageCommand({ ApiId, StageName: "dev", AutoDeploy: true }),
);

// The route comes off first, since the integration cannot be deleted while
// anything still targets it.
await apiGateway.deleteRoute(new DeleteRouteCommand({ ApiId, RouteId }));

await apiGateway.deleteIntegration(
  new DeleteIntegrationCommand({ ApiId, IntegrationId }),
);

await apiGateway.deleteStage(
  new DeleteStageCommand({ ApiId, StageName: "dev" }),
);

const routes = await apiGateway.getRoutes(new GetRoutesCommand({ ApiId }));
const integrations = await apiGateway.getIntegrations(
  new GetIntegrationsCommand({ ApiId }),
);

console.log(routes.Items.length, integrations.Items.length);
