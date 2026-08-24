import {
  GetIntegrationsCommand,
  GetRoutesCommand,
  GetStagesCommand,
  ImportApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  assertIdentical,
  assertNonNullable,
  assertStringMatches,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimApiGatewayV2Conflict } from "../error/sim-api-gateway-v2.error.js";
import { simHttpApiOpenApiDocumentFactory } from "./sim-http-api-openapi-document.factory.js";
import { simHttpApiOpenApiIntegrationFactory } from "./sim-http-api-openapi-integration.factory.js";

const integration = simHttpApiOpenApiIntegrationFactory.make();

describe("Importing a sim HTTP API from an OpenAPI document", () => {
  it("creates the API, one route and one integration per operation", async () => {
    // Given a document declaring two operations
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      title: "orders",
      paths: {
        "/orders": {
          get: { "x-amazon-apigateway-integration": integration },
          post: { "x-amazon-apigateway-integration": integration },
        },
      },
    });

    // When it is imported
    const imported = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then the API is named by the document, and each operation became a route
    // of its own with an integration behind it
    assertStringMatches(imported.ApiId, /^[a-z0-9]+$/);
    assertIdentical(imported.Name, "orders");
    assertIdentical(
      imported.ApiEndpoint,
      `https://${imported.ApiId}.execute-api.us-east-1.amazonaws.com`,
    );

    const routes = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: imported.ApiId }));
    expect(routes.Items.map((route) => route.RouteKey)).toStrictEqual([
      "GET /orders",
      "POST /orders",
    ]);

    const integrations = await simAws
      .apiGatewayV2()
      .getIntegrations(new GetIntegrationsCommand({ ApiId: imported.ApiId }));
    expect(integrations.Items).toHaveLength(2);
  });

  it("takes the path template into the route key unchanged", async () => {
    // Given a document whose path carries a parameter and a greedy segment
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders/{orderId}": {
          get: { "x-amazon-apigateway-integration": integration },
        },
        "/files/{proxy+}": {
          put: { "x-amazon-apigateway-integration": integration },
        },
      },
    });

    // When it is imported
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then the route keys are the method uppercased and the path verbatim,
    // since OpenAPI path templating is already API Gateway's own syntax
    const routes = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
    expect(routes.Items.map((route) => route.RouteKey)).toStrictEqual([
      "GET /orders/{orderId}",
      "PUT /files/{proxy+}",
    ]);
  });

  it("reads every operation key a route can be created for", async () => {
    // Given a path declaring all seven of them
    const simAws = new SimAws();
    const operations = Object.fromEntries(
      ["get", "put", "post", "delete", "options", "head", "patch"].map(
        (method) => [
          method,
          { "x-amazon-apigateway-integration": integration },
        ],
      ),
    );
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: { "/orders": operations },
    });

    // When it is imported
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then each one became a route
    const routes = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
    expect(routes.Items.map((route) => route.RouteKey)).toStrictEqual([
      "GET /orders",
      "PUT /orders",
      "POST /orders",
      "DELETE /orders",
      "OPTIONS /orders",
      "HEAD /orders",
      "PATCH /orders",
    ]);
  });

  it("shares one integration between operations referencing one definition", async () => {
    // Given two operations pointing at the same reusable definition
    const simAws = new SimAws();
    const reference = {
      $ref: "#/components/x-amazon-apigateway-integrations/orders",
    };
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          get: { "x-amazon-apigateway-integration": reference },
          post: { "x-amazon-apigateway-integration": reference },
        },
      },
      components: {
        "x-amazon-apigateway-integrations": { orders: integration },
      },
    });

    // When it is imported
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then the definition was created once, and both routes point at it
    const integrations = await simAws
      .apiGatewayV2()
      .getIntegrations(new GetIntegrationsCommand({ ApiId: apiId }));
    expect(integrations.Items).toHaveLength(1);
    const [created] = integrations.Items;
    assertNonNullable(created);

    const routes = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
    expect(routes.Items.map((route) => route.Target)).toStrictEqual([
      `integrations/${created.IntegrationId}`,
      `integrations/${created.IntegrationId}`,
    ]);
  });

  it("reads the bare function ARN as an integration URI too", async () => {
    // Given an operation whose integration names the function ARN itself,
    // rather than the API Gateway path form a document usually writes
    const simAws = new SimAws();
    const functionArn = "arn:aws:lambda:us-east-1:111111111111:function:orders";
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          get: {
            "x-amazon-apigateway-integration": {
              type: "aws_proxy",
              httpMethod: "POST",
              uri: functionArn,
              payloadFormatVersion: "2.0",
            },
          },
        },
      },
    });

    // When it is imported
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then both forms reach the same function
    const integrations = await simAws
      .apiGatewayV2()
      .getIntegrations(new GetIntegrationsCommand({ ApiId: apiId }));
    const [created] = integrations.Items;
    assertNonNullable(created);
    assertIdentical(created.IntegrationUri, functionArn);
  });

  it("ignores the members an HTTP API does not support", async () => {
    // Given a document carrying the request and response schemas AWS classes
    // as valid OpenAPI that HTTP APIs ignore
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          summary: "Orders",
          description: "Everything about orders",
          parameters: [
            { name: "traceId", in: "header", schema: { type: "string" } },
          ],
          post: {
            operationId: "createOrder",
            tags: ["orders"],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Order" },
                },
              },
            },
            responses: {
              "200": {
                description: "200 response",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Order" },
                  },
                },
              },
            },
            "x-amazon-apigateway-integration": integration,
          },
        },
      },
      components: {
        schemas: {
          Order: {
            type: "object",
            required: ["orderId"],
            properties: { orderId: { type: "string" } },
          },
        },
      },
    });

    // When it is imported
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then none of it is refused, and the route is the one the operation
    // declared. HTTP APIs validate no requests, so there was nothing to build.
    const routes = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
    expect(routes.Items.map((route) => route.RouteKey)).toStrictEqual([
      "POST /orders",
    ]);
  });

  it("creates no stage", async () => {
    // Given a document with an operation in it
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": { get: { "x-amazon-apigateway-integration": integration } },
      },
    });

    // When it is imported
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then the API has no stage, so nothing serves yet, which is what an
    // import does on AWS
    const stages = await simAws
      .apiGatewayV2()
      .getStages(new GetStagesCommand({ ApiId: apiId }));
    expect(stages.Items).toHaveLength(0);
  });

  it("accepts FailOnWarnings true, which is what it already does", async () => {
    // Given a document and the strict half of FailOnWarnings
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": { get: { "x-amazon-apigateway-integration": integration } },
      },
    });

    // When it is imported
    const imported = await simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: JSON.stringify(document),
        FailOnWarnings: true,
      }),
    );

    // Then the import goes ahead, since everything this simulation cannot
    // apply is refused whether or not the option is set
    assertIdentical(imported.Name, "orders");
  });

  it("passes on a conflict between two paths that are one route", async () => {
    // Given two paths whose parameters differ only by name, which is one route
    // key signature to API Gateway
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders/{orderId}": {
          get: { "x-amazon-apigateway-integration": integration },
        },
        "/orders/{id}": {
          get: { "x-amazon-apigateway-integration": integration },
        },
      },
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then the conflict CreateRoute reports is passed on as a conflict, rather
    // than reported as a problem with the document
    await expect(importing).rejects.toThrow(SimApiGatewayV2Conflict);
  });

  it("creates nothing at all when part of the document is refused", async () => {
    // Given a document whose second operation cannot be imported
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": { get: { "x-amazon-apigateway-integration": integration } },
        "/invoices": { get: {} },
      },
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then the refusal leaves no half-imported API behind, which would have
    // served one route and answered 404 for the other
    await expect(importing).rejects.toThrow("x-amazon-apigateway-integration");
    const apis = await simAws.apiGatewayV2().getApis({ input: {} });
    expect(apis.Items).toHaveLength(0);
  });
});
