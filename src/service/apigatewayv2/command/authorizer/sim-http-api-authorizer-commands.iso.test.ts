import {
  CreateApiCommand,
  CreateAuthorizerCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  DeleteAuthorizerCommand,
  GetAuthorizersCommand,
  GetRoutesCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertObjectMatches,
  assertStringLength,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

const issuer = "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_abc123";
const functionArn = "arn:aws:lambda:us-east-1:111111111111:function:orders";

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
      IntegrationUri: functionArn,
      PayloadFormatVersion: "2.0",
    }),
  );

  return created.IntegrationId;
}

function createAuthorizer(apiId: string): CreateAuthorizerCommand {
  return new CreateAuthorizerCommand({
    ApiId: apiId,
    Name: "pool-authorizer",
    AuthorizerType: "JWT",
    IdentitySource: ["$request.header.Authorization"],
    JwtConfiguration: { Issuer: issuer, Audience: ["client-1"] },
  });
}

describe("The authorizers of a sim HTTP API", () => {
  it("creates a JWT authorizer and reports it back", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When a JWT authorizer is created
    const created = await simAws
      .apiGatewayV2()
      .createAuthorizer(createAuthorizer(apiId));

    // Then it is reported with the id the API allocated and the configuration
    // it was given
    assertObjectMatches(created, {
      Name: "pool-authorizer",
      AuthorizerType: "JWT",
      IdentitySource: ["$request.header.Authorization"],
      JwtConfiguration: { Issuer: issuer, Audience: ["client-1"] },
    });
    assertStringLength(created.AuthorizerId, 6);
  });

  it("lists and deletes the authorizers of an API", async () => {
    // Given an API with one authorizer
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);
    const created = await simAws
      .apiGatewayV2()
      .createAuthorizer(createAuthorizer(apiId));

    // When the authorizers are listed, then deleted, then listed again
    const listed = await simAws
      .apiGatewayV2()
      .getAuthorizers(new GetAuthorizersCommand({ ApiId: apiId }));
    await simAws.apiGatewayV2().deleteAuthorizer(
      new DeleteAuthorizerCommand({
        ApiId: apiId,
        AuthorizerId: created.AuthorizerId,
      }),
    );
    const remaining = await simAws
      .apiGatewayV2()
      .getAuthorizers(new GetAuthorizersCommand({ ApiId: apiId }));

    // Then the list held it, and does not any more
    assertArrayLength(listed.Items, 1);
    assertIdentical(listed.Items[0].AuthorizerId, created.AuthorizerId);
    assertArrayEmpty(remaining.Items);
  });

  it("refuses deleting an authorizer the API does not have", async () => {
    // Given an API with no authorizers
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When one is deleted by an id nothing has
    // Then it is not found, as it is not on AWS
    await expect(
      simAws.apiGatewayV2().deleteAuthorizer(
        new DeleteAuthorizerCommand({
          ApiId: apiId,
          AuthorizerId: "auth01",
        }),
      ),
    ).rejects.toThrow(/No authorizer with id auth01/);
  });

  it("attaches an authorizer to a route with its scopes", async () => {
    // Given an API with an authorizer and an integration
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);
    const integrationId = await createdIntegrationId(simAws, apiId);
    const authorizer = await simAws
      .apiGatewayV2()
      .createAuthorizer(createAuthorizer(apiId));

    // When a route is created against that authorizer
    await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: apiId,
        RouteKey: "GET /orders",
        Target: `integrations/${integrationId}`,
        AuthorizationType: "JWT",
        AuthorizerId: authorizer.AuthorizerId,
        AuthorizationScopes: ["orders.read"],
      }),
    );

    // Then the route reports what it will ask a caller for
    const routes = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
    assertObjectMatches(routes.Items[0] ?? {}, {
      AuthorizationType: "JWT",
      AuthorizerId: authorizer.AuthorizerId,
      AuthorizationScopes: ["orders.read"],
    });
  });
});

describe("What CreateAuthorizer refuses rather than ignores", () => {
  it("refuses an authorizer type an HTTP API does not have", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an authorizer of a REST API's token kind is created. The command is
    // sent structurally rather than through the SDK, since the SDK types allow
    // only the two values an HTTP API has.
    // Then it is refused rather than created as something else
    await expect(
      simAws.apiGatewayV2().createAuthorizer({
        input: {
          ApiId: apiId,
          Name: "token",
          AuthorizerType: "TOKEN",
          IdentitySource: ["$request.header.Authorization"],
        },
      }),
    ).rejects.toThrow(/AuthorizerType 'TOKEN' is not simulated/);
  });

  it("refuses the options only a Lambda authorizer takes on a JWT one", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When a JWT authorizer asks for a result cache, or for a function to call
    // Then each is refused by name rather than dropped
    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "cached",
          AuthorizerType: "JWT",
          IdentitySource: ["$request.header.Authorization"],
          JwtConfiguration: { Issuer: issuer, Audience: ["client-1"] },
          AuthorizerResultTtlInSeconds: 300,
        }),
      ),
    ).rejects.toThrow(/AuthorizerResultTtlInSeconds is set on a JWT/);

    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "lambda",
          AuthorizerType: "JWT",
          IdentitySource: ["$request.header.Authorization"],
          JwtConfiguration: { Issuer: issuer, Audience: ["client-1"] },
          AuthorizerUri: functionArn,
        }),
      ),
    ).rejects.toThrow(/AuthorizerUri is set on a JWT authorizer/);
  });

  it("requires an issuer and an audience", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an authorizer is created with neither, then with no audience
    // Then each is refused, since an authorizer that trusts nothing in
    // particular would either refuse everyone or admit everyone
    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "pool",
          AuthorizerType: "JWT",
          IdentitySource: ["$request.header.Authorization"],
        }),
      ),
    ).rejects.toThrow(/requires JwtConfiguration/);

    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "pool",
          AuthorizerType: "JWT",
          IdentitySource: ["$request.header.Authorization"],
          JwtConfiguration: { Audience: ["client-1"] },
        }),
      ),
    ).rejects.toThrow(/requires JwtConfiguration.Issuer/);

    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "pool",
          AuthorizerType: "JWT",
          IdentitySource: ["$request.header.Authorization"],
          JwtConfiguration: { Issuer: issuer },
        }),
      ),
    ).rejects.toThrow(/requires JwtConfiguration.Audience/);
  });

  it("refuses an identity source it would not read", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an authorizer is created with no identity source, with two, and
    // with an expression naming neither a header nor a query parameter
    // Then each is refused, since an authorizer looking for the token nowhere
    // refuses every request for a reason that looks like a signing problem
    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "pool",
          AuthorizerType: "JWT",
          IdentitySource: [],
          JwtConfiguration: { Issuer: issuer, Audience: ["client-1"] },
        }),
      ),
    ).rejects.toThrow(/requires IdentitySource/);

    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "pool",
          AuthorizerType: "JWT",
          IdentitySource: [
            "$request.header.Authorization",
            "$request.querystring.access_token",
          ],
          JwtConfiguration: { Issuer: issuer, Audience: ["client-1"] },
        }),
      ),
    ).rejects.toThrow(/a JWT authorizer takes one/);

    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "pool",
          AuthorizerType: "JWT",
          IdentitySource: ["$context.authorizer.token"],
          JwtConfiguration: { Issuer: issuer, Audience: ["client-1"] },
        }),
      ),
    ).rejects.toThrow(/IdentitySource '\$context.authorizer.token'/);
  });

  it("refuses the route as a JWT authorizer's identity source", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When a JWT authorizer looks for its token in the route key
    // Then it is refused, since a JWT authorizer reads the token the client
    // sent and a route key is not one, and the refusal does not offer it
    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "pool",
          AuthorizerType: "JWT",
          IdentitySource: ["$context.routeKey"],
          JwtConfiguration: { Issuer: issuer, Audience: ["client-1"] },
        }),
      ),
    ).rejects.toThrow(
      /IdentitySource '\$context.routeKey' is not simulated: an identity source is '\$request.header.<name>' or '\$request.querystring.<name>'/,
    );
  });

  it("refuses an authorizer with no name, and a paged list", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // Then a nameless authorizer and a paged list are both refused
    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "",
          AuthorizerType: "JWT",
          IdentitySource: ["$request.header.Authorization"],
          JwtConfiguration: { Issuer: issuer, Audience: ["client-1"] },
        }),
      ),
    ).rejects.toThrow(/CreateAuthorizer requires Name/);

    await expect(
      simAws
        .apiGatewayV2()
        .getAuthorizers(
          new GetAuthorizersCommand({ ApiId: apiId, MaxResults: "1" }),
        ),
    ).rejects.toThrow(/GetAuthorizers paging is not simulated/);
  });
});
