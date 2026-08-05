import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  DeleteIntegrationCommand,
  DeleteRouteCommand,
  GetIntegrationsCommand,
} from "@aws-sdk/client-apigatewayv2";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayV2BadRequest,
  SimApiGatewayV2NotFound,
} from "../../error/sim-api-gateway-v2.error.js";

const functionArn = "arn:aws:lambda:us-east-1:111111111111:function:orders";

/**
 * Create an API with one integration on it.
 */
async function apiWithIntegration(
  simAws: SimAws,
): Promise<{ apiId: string; integrationId: string }> {
  const { ApiId: apiId } = await simAws
    .apiGatewayV2()
    .createApi(new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }));
  const { IntegrationId: integrationId } = await simAws
    .apiGatewayV2()
    .createIntegration(
      new CreateIntegrationCommand({
        ApiId: apiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: functionArn,
        PayloadFormatVersion: "2.0",
      }),
    );

  return { apiId, integrationId };
}

describe("Sim API Gateway v2 DeleteIntegration", () => {
  it("deletes an integration no route points at", async () => {
    // Given an API with two integrations and a route onto one of them
    const simAws = new SimAws();
    const { apiId, integrationId } = await apiWithIntegration(simAws);
    const { IntegrationId: unused } = await simAws
      .apiGatewayV2()
      .createIntegration(
        new CreateIntegrationCommand({
          ApiId: apiId,
          IntegrationType: "AWS_PROXY",
          IntegrationUri: functionArn,
          PayloadFormatVersion: "2.0",
        }),
      );
    await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "GET /pets",
        Target: `integrations/${integrationId}`,
      }),
    );

    // When the one nothing routes to is deleted
    await simAws
      .apiGatewayV2()
      .deleteIntegration(
        new DeleteIntegrationCommand({ ApiId: apiId, IntegrationId: unused }),
      );

    // Then the routed one is left alone
    const { Items: integrations } = await simAws
      .apiGatewayV2()
      .getIntegrations(new GetIntegrationsCommand({ ApiId: apiId }));
    expect(
      integrations.map((integration) => integration.IntegrationId),
    ).toStrictEqual([integrationId]);
  });

  it("refuses an integration a route still targets", async () => {
    // Given an API whose route targets its integration
    const simAws = new SimAws();
    const { apiId, integrationId } = await apiWithIntegration(simAws);
    await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "GET /pets",
        Target: `integrations/${integrationId}`,
      }),
    );

    // When the integration is deleted first
    // Then it is refused, naming the route in the way, which is the ordering
    // constraint real API Gateway imposes on taking an API apart
    await expect(
      simAws.apiGatewayV2().deleteIntegration(
        new DeleteIntegrationCommand({
          ApiId: apiId,
          IntegrationId: integrationId,
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
    await expect(
      simAws.apiGatewayV2().deleteIntegration(
        new DeleteIntegrationCommand({
          ApiId: apiId,
          IntegrationId: integrationId,
        }),
      ),
    ).rejects.toThrow(/while it is the target of GET \/pets/);
  });

  it("deletes the integration once its routes are gone", async () => {
    // Given an API whose route targets its integration
    const simAws = new SimAws();
    const { apiId, integrationId } = await apiWithIntegration(simAws);
    const { RouteId: routeId } = await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "GET /pets",
        Target: `integrations/${integrationId}`,
      }),
    );

    // When the route comes off first, then the integration
    await simAws
      .apiGatewayV2()
      .deleteRoute(new DeleteRouteCommand({ ApiId: apiId, RouteId: routeId }));
    await simAws.apiGatewayV2().deleteIntegration(
      new DeleteIntegrationCommand({
        ApiId: apiId,
        IntegrationId: integrationId,
      }),
    );

    // Then the API is left with neither
    const { Items: integrations } = await simAws
      .apiGatewayV2()
      .getIntegrations(new GetIntegrationsCommand({ ApiId: apiId }));
    expect(integrations).toStrictEqual([]);
  });

  it("refuses an integration id the API does not have", async () => {
    // Given an API with an integration
    const simAws = new SimAws();
    const { apiId } = await apiWithIntegration(simAws);

    // When some other integration id is deleted
    // Then it is reported as not found
    await expect(
      simAws.apiGatewayV2().deleteIntegration(
        new DeleteIntegrationCommand({
          ApiId: apiId,
          IntegrationId: "abcdefgh",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
  });

  it("requires the integration to delete", async () => {
    // Given an API with an integration
    const simAws = new SimAws();
    const { apiId } = await apiWithIntegration(simAws);

    // When no integration id is given, which the SDK command type does not
    // allow but a hand-built request can carry
    // Then the command is refused rather than deleting anything
    await expect(
      simAws.apiGatewayV2().deleteIntegration({ input: { ApiId: apiId } }),
    ).rejects.toThrow(/DeleteIntegration requires IntegrationId/);
  });
});
