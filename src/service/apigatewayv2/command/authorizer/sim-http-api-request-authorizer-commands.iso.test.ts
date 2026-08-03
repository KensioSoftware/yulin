import {
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  GetAuthorizersCommand,
  GetRoutesCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  assertIdentical,
  assertObjectMatches,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

const functionArn = "arn:aws:lambda:eu-west-2:111111111111:function:session";
const issuer = "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_abc123";

async function createdApiId(simAws: SimAws): Promise<string> {
  const created = await simAws
    .apiGatewayV2()
    .createApi(new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }));

  return created.ApiId;
}

async function createdIntegrationId(
  simAws: SimAws,
  apiId: string,
): Promise<string> {
  const created = await simAws.apiGatewayV2().createIntegration(
    new CreateIntegrationCommand({
      ApiId: apiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: "arn:aws:lambda:eu-west-2:111111111111:function:orders",
      PayloadFormatVersion: "2.0",
    }),
  );

  return created.IntegrationId;
}

function createRequestAuthorizer(apiId: string): CreateAuthorizerCommand {
  return new CreateAuthorizerCommand({
    ApiId: apiId,
    Name: "session-cookie",
    AuthorizerType: "REQUEST",
    AuthorizerUri: functionArn,
    AuthorizerPayloadFormatVersion: "2.0",
    EnableSimpleResponses: true,
    IdentitySource: ["$request.header.cookie"],
  });
}

describe("Creating a sim HTTP API Lambda REQUEST authorizer", () => {
  it("creates one and reports it back", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When a REQUEST authorizer is created
    const created = await simAws
      .apiGatewayV2()
      .createAuthorizer(createRequestAuthorizer(apiId));

    // Then it reports the function it invokes and the shape it answers in,
    // and no JwtConfiguration, which it has no use for
    assertObjectMatches(created, {
      Name: "session-cookie",
      AuthorizerType: "REQUEST",
      AuthorizerUri: functionArn,
      AuthorizerPayloadFormatVersion: "2.0",
      EnableSimpleResponses: true,
      IdentitySource: ["$request.header.cookie"],
    });
    assertUndefined(created.JwtConfiguration);
  });

  it("takes more than one identity source", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an authorizer reads two places on the request
    await simAws.apiGatewayV2().createAuthorizer(
      new CreateAuthorizerCommand({
        ApiId: apiId,
        Name: "two-sources",
        AuthorizerType: "REQUEST",
        AuthorizerUri: functionArn,
        AuthorizerPayloadFormatVersion: "2.0",
        IdentitySource: [
          "$request.header.cookie",
          "$request.querystring.tenant",
        ],
      }),
    );

    // Then both are held, unlike a JWT authorizer, which takes one
    const listed = await simAws
      .apiGatewayV2()
      .getAuthorizers(new GetAuthorizersCommand({ ApiId: apiId }));
    expect(listed.Items[0]?.IdentitySource).toStrictEqual([
      "$request.header.cookie",
      "$request.querystring.tenant",
    ]);
  });

  it("takes the wrapped URI form a template writes", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When the authorizer names its function the long way round
    const created = await simAws.apiGatewayV2().createAuthorizer(
      new CreateAuthorizerCommand({
        ApiId: apiId,
        Name: "wrapped",
        AuthorizerType: "REQUEST",
        AuthorizerUri:
          `arn:aws:apigateway:eu-west-2:lambda:path/2015-03-31/functions/` +
          `${functionArn}/invocations`,
        AuthorizerPayloadFormatVersion: "2.0",
        IdentitySource: ["$request.header.cookie"],
      }),
    );

    // Then it is held as the function ARN, the way an integration URI is
    assertIdentical(created.AuthorizerUri, functionArn);
  });

  it("attaches to a route as CUSTOM authorization", async () => {
    // Given an API with a REQUEST authorizer and an integration
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);
    const integrationId = await createdIntegrationId(simAws, apiId);
    const authorizer = await simAws
      .apiGatewayV2()
      .createAuthorizer(createRequestAuthorizer(apiId));

    // When a route names it
    await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "GET /account",
        Target: `integrations/${integrationId}`,
        AuthorizationType: "CUSTOM",
        AuthorizerId: authorizer.AuthorizerId,
      }),
    );

    // Then the route reports what it sends its requests through
    const routes = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
    assertObjectMatches(routes.Items[0] ?? {}, {
      AuthorizationType: "CUSTOM",
      AuthorizerId: authorizer.AuthorizerId,
    });
  });

  it("refuses a route pointing the wrong kind of authorizer at itself", async () => {
    // Given an API with one authorizer of each kind
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);
    const integrationId = await createdIntegrationId(simAws, apiId);
    const request = await simAws
      .apiGatewayV2()
      .createAuthorizer(createRequestAuthorizer(apiId));
    const jwt = await simAws.apiGatewayV2().createAuthorizer(
      new CreateAuthorizerCommand({
        ApiId: apiId,
        Name: "pool",
        AuthorizerType: "JWT",
        IdentitySource: ["$request.header.Authorization"],
        JwtConfiguration: { Issuer: issuer, Audience: ["client-1"] },
      }),
    );

    // When each route names the other kind
    // Then both are refused, rather than serving a request through an
    // authorizer that cannot answer for them
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "GET /account",
          Target: `integrations/${integrationId}`,
          AuthorizationType: "CUSTOM",
          AuthorizerId: jwt.AuthorizerId,
        }),
      ),
    ).rejects.toThrow(/names a JWT authorizer.+takes a REQUEST one/);

    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "GET /orders",
          Target: `integrations/${integrationId}`,
          AuthorizationType: "JWT",
          AuthorizerId: request.AuthorizerId,
        }),
      ),
    ).rejects.toThrow(/names a REQUEST authorizer.+takes a JWT one/);
  });

  it("refuses route scopes on a route a Lambda authorizer decides", async () => {
    // Given an API with a REQUEST authorizer
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);
    const integrationId = await createdIntegrationId(simAws, apiId);
    const authorizer = await simAws
      .apiGatewayV2()
      .createAuthorizer(createRequestAuthorizer(apiId));

    // When a CUSTOM route asks a caller for a scope
    // Then it is refused, since AWS applies route scopes to a JWT route only
    await expect(
      simAws.apiGatewayV2().createRoute(
        new CreateRouteCommand({
          ApiId: apiId,
          RouteKey: "GET /account",
          Target: `integrations/${integrationId}`,
          AuthorizationType: "CUSTOM",
          AuthorizerId: authorizer.AuthorizerId,
          AuthorizationScopes: ["account.read"],
        }),
      ),
    ).rejects.toThrow(/AuthorizationScopes is set on a route with/);
  });
});
