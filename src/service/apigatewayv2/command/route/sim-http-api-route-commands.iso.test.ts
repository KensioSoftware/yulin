import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  GetRoutesCommand,
} from "@aws-sdk/client-apigatewayv2";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
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

  it("creates a route for a method and a path", async () => {
    // Given an API with an integration
    const simAws = new SimAws();
    const { apiId, target } = await apiWithIntegration(simAws);

    // When a route names a method and a parameterised path
    const created = await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "GET /pets/{petId}",
        Target: target,
      }),
    );

    // Then the route key comes back as it was written
    assertIdentical(created.RouteKey, "GET /pets/{petId}");
    assertIdentical(created.Target, target);
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

  it("refuses two route keys differing only in parameter name", async () => {
    // Given an API already routing a parameterised path
    const simAws = new SimAws();
    const { apiId, target } = await apiWithIntegration(simAws);
    await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "GET /pets/{id}",
        Target: target,
      }),
    );

    // When the same path is routed again under another parameter name
    // Then it conflicts, because a parameter name is not part of a route's
    // identity: both keys match exactly the same requests
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "GET /pets/{petId}",
          Target: target,
        }),
      ),
    ).rejects.toThrow(/already has a route for GET \/pets\/\{id\}/);
  });

  it("refuses a malformed route key", async () => {
    // Given an API with an integration
    const simAws = new SimAws();
    const { apiId, target } = await apiWithIntegration(simAws);

    // When a route key cannot be read
    // Then it is refused here, which is where real API Gateway refuses it too
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "get /pets",
          Target: target,
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
  });

  it("refuses a route on an API that does not exist", async () => {
    // Given a simulated AWS with no APIs in it
    const simAws = new SimAws();

    // When a route is created on an API id nothing holds
    // Then it is reported as not found
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: "abcdefghij",
          RouteKey: "$default",
          Target: "integrations/abcdefgh",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
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

  it("creates an IAM-authorized route and reports it back", async () => {
    // Given an API with an integration
    const simAws = new SimAws();
    const { apiId, target } = await apiWithIntegration(simAws);

    // When a route asks for AWS_IAM
    await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "GET /orders/{orderId}",
        Target: target,
        AuthorizationType: "AWS_IAM",
      }),
    );

    // Then it is created with no authorizer and no scopes, which is what an
    // AWS_IAM route has, and GetRoutes reports the type back
    const { Items: routes } = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
    expect(routes).toStrictEqual([
      expect.objectContaining({
        RouteKey: "GET /orders/{orderId}",
        Target: target,
        AuthorizationType: "AWS_IAM",
      }),
    ]);
    assertUndefined(routes[0]?.AuthorizerId);
    assertUndefined(routes[0]?.AuthorizationScopes);
  });

  it("refuses an AuthorizerId on an IAM-authorized route", async () => {
    // Given an API with an integration
    const simAws = new SimAws();
    const { apiId, target } = await apiWithIntegration(simAws);

    // When an AWS_IAM route also names an authorizer
    // Then it is refused: IAM itself decides such a route, so there is no
    // authorizer to send the request through
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "GET /orders",
          Target: target,
          AuthorizationType: "AWS_IAM",
          AuthorizerId: "abcdefgh",
        }),
      ),
    ).rejects.toThrow(
      /AuthorizerId is set on a route with AuthorizationType AWS_IAM/,
    );
  });

  it("refuses AuthorizationScopes on an IAM-authorized route", async () => {
    // Given an API with an integration
    const simAws = new SimAws();
    const { apiId, target } = await apiWithIntegration(simAws);

    // When an AWS_IAM route asks for a scope
    // Then it is refused. This is stricter than AWS, which ignores route
    // scopes outside a JWT route: accepting one would let a test assert on a
    // restriction nothing applies.
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "GET /orders",
          Target: target,
          AuthorizationType: "AWS_IAM",
          AuthorizationScopes: ["orders.read"],
        }),
      ),
    ).rejects.toThrow(
      /AuthorizationScopes is set on a route with AuthorizationType AWS_IAM/,
    );
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
