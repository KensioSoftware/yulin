import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  GetRoutesCommand,
} from "@aws-sdk/client-apigatewayv2";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayV2BadRequest,
  SimApiGatewayV2Conflict,
  SimApiGatewayV2NotFound,
} from "../../error/sim-api-gateway-v2.error.js";

const functionArn = "arn:aws:lambda:us-east-1:111111111111:function:orders";

/**
 * Create an API with one integration, which is what a route needs to exist.
 */
async function apiWithIntegration(
  simAws: SimAws,
): Promise<{ apiId: string; target: string }> {
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

  return { apiId, target: `integrations/${integrationId}` };
}

describe("Sim API Gateway v2 route commands", () => {
  it("creates a catch-all route onto an integration", async () => {
    // Given an API with an integration
    const simAws = new SimAws();
    const { apiId, target } = await apiWithIntegration(simAws);

    // When a $default route targets it
    const created = await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "$default",
        Target: target,
      }),
    );

    // Then the route reports the target in the form it was given
    assertIdentical(created.RouteKey, "$default");
    assertIdentical(created.Target, target);
    assertIdentical(created.AuthorizationType, "NONE");
  });

  it("lists the routes of an API", async () => {
    // Given an API with a route
    const simAws = new SimAws();
    const { apiId, target } = await apiWithIntegration(simAws);
    const { RouteId: routeId } = await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "$default",
        Target: target,
      }),
    );

    // When its routes are listed
    const { Items: items } = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));

    // Then the route is there
    expect(items.map((route) => route.RouteId)).toStrictEqual([routeId]);
  });

  it("refuses a second route for a route key the API already has", async () => {
    // Given an API that already routes $default
    const simAws = new SimAws();
    const { apiId, target } = await apiWithIntegration(simAws);
    await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "$default",
        Target: target,
      }),
    );

    // When the same route key is created again
    // Then it conflicts, as it does on real AWS
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "$default",
          Target: target,
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2Conflict);
  });

  it("refuses a route targeting an integration the API does not have", async () => {
    // Given an API with an integration
    const simAws = new SimAws();
    const { apiId } = await apiWithIntegration(simAws);

    // When a route targets some other integration id
    // Then it is reported as not found
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "$default",
          Target: "integrations/abcdefgh",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
  });

  it("refuses a target that is not an integration", async () => {
    // Given an API with an integration
    const simAws = new SimAws();
    const { apiId } = await apiWithIntegration(simAws);

    // When a route targets something else, as a WebSocket API route can
    // Then it is refused rather than stored as a route with nothing to serve
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "$default",
          Target: "$default",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
  });
});
