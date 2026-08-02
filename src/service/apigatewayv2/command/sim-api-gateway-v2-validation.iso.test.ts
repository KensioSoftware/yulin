import {
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  GetApisCommand,
} from "@aws-sdk/client-apigatewayv2";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimApiGatewayV2BadRequest } from "../error/sim-api-gateway-v2.error.js";

const functionArn = "arn:aws:lambda:us-east-1:111111111111:function:orders";

/**
 * Create an API to hang a refused child request off.
 */
async function createdApiId(simAws: SimAws): Promise<string> {
  const created = await simAws
    .apiGatewayV2()
    .createApi(new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }));

  return created.ApiId;
}

describe("What sim API Gateway v2 refuses rather than ignores", () => {
  it("refuses a WebSocket API", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When a WebSocket API is created
    // Then it is refused, because none of that protocol is simulated
    await expect(
      simAws
        .apiGatewayV2()
        .createApi(
          new CreateApiCommand({ Name: "orders", ProtocolType: "WEBSOCKET" }),
        ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
  });

  it("refuses CORS configuration and tags on an API", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When an API asks for behaviour nothing here applies
    // Then each option is refused by name rather than dropped, which would
    // leave the API looking configured to the request that made it
    await expect(
      simAws.apiGatewayV2().createApi(
        new CreateApiCommand({
          Name: "orders",
          ProtocolType: "HTTP",
          CorsConfiguration: { AllowOrigins: ["https://yulinsim.dev"] },
        }),
      ),
    ).rejects.toThrow(/CorsConfiguration is not simulated/);

    await expect(
      simAws.apiGatewayV2().createApi(
        new CreateApiCommand({
          Name: "orders",
          ProtocolType: "HTTP",
          Tags: { team: "orders" },
        }),
      ),
    ).rejects.toThrow(/Tags is not simulated/);
  });

  it("refuses the quick-create shorthand", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When CreateApi is asked to make the route and integration too
    // Then it is refused, because an API that quietly ignored them would have
    // no route at all
    await expect(
      simAws.apiGatewayV2().createApi(
        new CreateApiCommand({
          Name: "orders",
          ProtocolType: "HTTP",
          RouteKey: "$default",
          Target: functionArn,
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
  });

  it("refuses payload format 1.0", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an integration asks for the older payload format
    // Then it is refused, because a handler written for 1.0 reads event
    // fields a 2.0 event does not have
    await expect(
      simAws.apiGatewayV2().createIntegration(
        new CreateIntegrationCommand({
          ApiId: apiId,
          IntegrationType: "AWS_PROXY",
          IntegrationUri: functionArn,
          PayloadFormatVersion: "1.0",
        }),
      ),
    ).rejects.toThrow(/PayloadFormatVersion '1.0' is not simulated/);
  });

  it("refuses an integration type other than AWS_PROXY", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an HTTP proxy integration is created
    // Then it is refused, because only a Lambda proxy is simulated
    await expect(
      simAws.apiGatewayV2().createIntegration(
        new CreateIntegrationCommand({
          ApiId: apiId,
          IntegrationType: "HTTP_PROXY",
          IntegrationUri: "https://example.test/orders",
          PayloadFormatVersion: "2.0",
        }),
      ),
    ).rejects.toThrow(/IntegrationType 'HTTP_PROXY' is not simulated/);
  });

  it("refuses a route key that names a method and path", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When a route matches one method and path
    // Then it is refused, because route matching is not simulated and every
    // request reaches the catch-all route
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "GET /orders",
          Target: "integrations/abcdefgh",
        }),
      ),
    ).rejects.toThrow(/RouteKey 'GET \/orders' is not simulated/);
  });

  it("refuses a route with an authorizer", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When a route asks for JWT authorization
    // Then it is refused, because nothing here would check a token and the
    // route would be open where the real one is closed
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "$default",
          Target: "integrations/abcdefgh",
          AuthorizationType: "JWT",
        }),
      ),
    ).rejects.toThrow(/AuthorizationType 'JWT' is not simulated/);
  });

  it("refuses a paged list request", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When APIs are listed a page at a time
    // Then it is refused, because every list answers in full and a caller
    // following NextToken here would loop or lose results
    await expect(
      simAws.apiGatewayV2().getApis(new GetApisCommand({ MaxResults: "1" })),
    ).rejects.toThrow(/paging is not simulated/);
  });

  it("requires the inputs a command cannot proceed without", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When CreateApi is sent with no name, which the SDK's own types would
    // not allow, so the command is built by hand here
    // Then it says which input is missing
    await expect(
      simAws.apiGatewayV2().createApi({ input: { ProtocolType: "HTTP" } }),
    ).rejects.toThrow(/CreateApi requires Name/);
  });
});
