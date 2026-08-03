import {
  GetAuthorizersCommand,
  GetRoutesCommand,
  ImportApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiOpenApiDocumentFactory } from "./sim-http-api-openapi-document.factory.js";
import { simHttpApiOpenApiIntegrationFactory } from "./sim-http-api-openapi-integration.factory.js";

const integration = simHttpApiOpenApiIntegrationFactory.make();

const issuer = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_orders";

/**
 * The security scheme an HTTP API declares a JWT authorizer with.
 */
const jwtScheme: JSONObject = {
  type: "oauth2",
  "x-amazon-apigateway-authorizer": {
    type: "jwt",
    identitySource: "$request.header.Authorization",
    jwtConfiguration: { issuer, audience: ["orders-client"] },
  },
};

/**
 * A document whose one operation is protected by the scheme under test.
 */
function protectedDocument(
  scheme: JSONObject,
  security: JSONValue = [{ "pool-authorizer": ["orders.read"] }],
): string {
  return JSON.stringify(
    simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          get: {
            security,
            "x-amazon-apigateway-integration": integration,
          },
        },
      },
      components: { securitySchemes: { "pool-authorizer": scheme } },
    }),
  );
}

describe("Importing a sim HTTP API's JWT authorizers", () => {
  it("creates one authorizer named after the security scheme", async () => {
    // Given a document whose operation names a JWT security scheme
    const simAws = new SimAws();

    // When it is imported
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: protectedDocument(jwtScheme) }));

    // Then the scheme key is the authorizer's name, and the comma-separated
    // identity source arrives as the single-entry list CreateAuthorizer takes
    const authorizers = await simAws
      .apiGatewayV2()
      .getAuthorizers(new GetAuthorizersCommand({ ApiId: apiId }));
    expect(authorizers.Items).toHaveLength(1);
    const [authorizer] = authorizers.Items;
    assertNonNullable(authorizer);
    assertIdentical(authorizer.Name, "pool-authorizer");
    assertIdentical(authorizer.AuthorizerType, "JWT");
    expect(authorizer.IdentitySource).toStrictEqual([
      "$request.header.Authorization",
    ]);
    assertIdentical(authorizer.JwtConfiguration?.Issuer, issuer);

    // And the operation's route is the one pointed at that authorizer, asking
    // a token for the scopes the requirement named
    const routes = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
    const [route] = routes.Items;
    assertNonNullable(route);
    assertIdentical(route.AuthorizationType, "JWT");
    assertIdentical(route.AuthorizerId, authorizer.AuthorizerId);
    expect(route.AuthorizationScopes).toStrictEqual(["orders.read"]);
  });

  it("shares one authorizer between every operation naming the scheme", async () => {
    // Given two operations naming the same scheme
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          get: {
            security: [{ "pool-authorizer": [] }],
            "x-amazon-apigateway-integration": integration,
          },
          post: {
            security: [{ "pool-authorizer": [] }],
            "x-amazon-apigateway-integration": integration,
          },
        },
      },
      components: { securitySchemes: { "pool-authorizer": jwtScheme } },
    });

    // When it is imported
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then the authorizer was created once, as an HTTP API authorizer belongs
    // to the API rather than to a route
    const authorizers = await simAws
      .apiGatewayV2()
      .getAuthorizers(new GetAuthorizersCommand({ ApiId: apiId }));
    expect(authorizers.Items).toHaveLength(1);
  });

  it("creates no authorizer for a scheme nothing names", async () => {
    // Given a document declaring a scheme its one operation does not use
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": { get: { "x-amazon-apigateway-integration": integration } },
      },
      components: { securitySchemes: { "pool-authorizer": jwtScheme } },
    });

    // When it is imported
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then nothing was created for it, since an unreferenced scheme protects
    // nothing
    const authorizers = await simAws
      .apiGatewayV2()
      .getAuthorizers(new GetAuthorizersCommand({ ApiId: apiId }));
    expect(authorizers.Items).toHaveLength(0);
  });

  it("refuses a requirement naming a scheme the document does not define", async () => {
    // Given an operation naming a scheme that is not there
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          get: {
            security: [{ "missing-authorizer": [] }],
            "x-amazon-apigateway-integration": integration,
          },
        },
      },
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused rather than leaving the route open
    await expect(importing).rejects.toThrow(
      "names the security scheme 'missing-authorizer', which " +
        "#/components/securitySchemes does not define",
    );
  });

  it("refuses an operation carrying more than one security requirement", async () => {
    // Given an operation asking for two of them
    const simAws = new SimAws();
    const security = [{ "pool-authorizer": [] }, { "other-authorizer": [] }];

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(
        new ImportApiCommand({ Body: protectedDocument(jwtScheme, security) }),
      );

    // Then it is refused, matching AWS: a route has one authorizer
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/security: carries 2 security " +
        "requirements",
    );
  });

  it("refuses a security requirement naming two schemes at once", async () => {
    // Given one requirement listing two schemes, which OpenAPI reads as both
    const simAws = new SimAws();
    const security = [{ "pool-authorizer": [], "other-authorizer": [] }];

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(
        new ImportApiCommand({ Body: protectedDocument(jwtScheme, security) }),
      );

    // Then it is refused, since only one of them could be applied
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/security/0: names 2 security " +
        "schemes",
    );
  });
});
