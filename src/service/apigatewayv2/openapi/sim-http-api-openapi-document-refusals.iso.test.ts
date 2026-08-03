import { ImportApiCommand } from "@aws-sdk/client-apigatewayv2";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiOpenApiDocumentFactory } from "./sim-http-api-openapi-document.factory.js";
import { simHttpApiOpenApiIntegrationFactory } from "./sim-http-api-openapi-integration.factory.js";

const integration = simHttpApiOpenApiIntegrationFactory.make();

describe("What a sim HTTP API import refuses in a document", () => {
  it("refuses a Swagger 2 document, and creates no API", async () => {
    // Given a document written for the specification before OpenAPI 3
    const simAws = new SimAws();
    const document = { swagger: "2.0", info: { title: "orders" }, paths: {} };

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused by version, before anything is created
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/swagger: a Swagger 2 document is not simulated",
    );
    const apis = await simAws.apiGatewayV2().getApis({ input: {} });
    expect(apis.Items).toHaveLength(0);
  });

  it("refuses an OpenAPI 3.1 document, naming the version, and creates no API", async () => {
    // Given a document declaring the version after the one that is read
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      openapi: "3.1.0",
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then the version it found is named, and nothing is created
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/openapi: is '3.1.0', and only OpenAPI 3.0.x is " +
        "simulated",
    );
    const apis = await simAws.apiGatewayV2().getApis({ input: {} });
    expect(apis.Items).toHaveLength(0);
  });

  it("refuses a document that declares no version at all", async () => {
    // Given a document with no `openapi` member
    const simAws = new SimAws();

    // When it is imported
    const importing = simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: JSON.stringify({ info: { title: "orders" }, paths: {} }),
      }),
    );

    // Then it is refused, since nothing says which specification to read it as
    await expect(importing).rejects.toThrow("ImportApi refused #/openapi");
  });

  it("refuses a member written as the wrong kind of JSON", async () => {
    // Given a document whose version is a number and whose security is an
    // object rather than the list of requirements it has to be
    const simAws = new SimAws();
    const numbered = { openapi: 3, info: { title: "orders" }, paths: {} };
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          get: {
            security: { "pool-authorizer": [] },
            "x-amazon-apigateway-integration": integration,
          },
        },
      },
    });

    // When the first is imported
    const versionRefusal = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(numbered) }));

    // Then it is refused as the shape it is, naming where it is
    await expect(versionRefusal).rejects.toThrow(
      "ImportApi refused #/openapi: has to be a string",
    );

    // And so is the second
    const securityRefusal = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));
    await expect(securityRefusal).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/security: has to be an array",
    );
  });

  it("refuses a body that is not JSON", async () => {
    // Given a document written as YAML
    const simAws = new SimAws();

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: "openapi: 3.0.1\npaths: {}\n" }));

    // Then it is refused, naming the document itself
    await expect(importing).rejects.toThrow(
      "ImportApi refused #: is not a JSON document",
    );
  });

  it("refuses a body that is JSON but not an object", async () => {
    // Given a body holding a JSON array
    const simAws = new SimAws();

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: "[]" }));

    // Then it is refused as the wrong shape
    await expect(importing).rejects.toThrow(
      "ImportApi refused #: has to be an object",
    );
  });

  it("refuses a document with no title to name the API after", async () => {
    // Given a document whose info carries no title
    const simAws = new SimAws();
    const document = { openapi: "3.0.1", info: { version: "1.0" }, paths: {} };

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused, since an API is created with a name
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/info/title: is required",
    );
  });

  it("refuses a document with no paths", async () => {
    // Given a document with the required paths member left out
    const simAws = new SimAws();
    const document = { openapi: "3.0.1", info: { title: "orders" } };

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused rather than read as an API with no routes
    await expect(importing).rejects.toThrow("ImportApi refused #/paths");
  });

  it("refuses a servers list, which would set a base path", async () => {
    // Given a document naming the server it is served from
    const simAws = new SimAws();
    const document = {
      ...simHttpApiOpenApiDocumentFactory.make(),
      servers: [{ url: "https://api.example.com/v1" }],
    };

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused by name, since a base path changes the path every
    // route matches on
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/servers: a server URL sets the base path",
    );
  });

  it("refuses a document-level security requirement", async () => {
    // Given a document applying one scheme to every operation
    const simAws = new SimAws();
    const document = {
      ...simHttpApiOpenApiDocumentFactory.make(),
      security: [{ "pool-authorizer": [] }],
    };

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused rather than applied to routes AWS may leave open
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/security: a security requirement applying to " +
        "every operation is not simulated",
    );
  });

  it("refuses a CORS configuration", async () => {
    // Given a document configuring preflight responses
    const simAws = new SimAws();
    const document = {
      ...simHttpApiOpenApiDocumentFactory.make(),
      "x-amazon-apigateway-cors": { allowOrigins: ["https://example.com"] },
    };

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused, as an AWS::ApiGatewayV2::Api CorsConfiguration is
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/x-amazon-apigateway-cors: CORS request handling",
    );
  });

  it("refuses a trace operation", async () => {
    // Given a path item declaring one
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          trace: { "x-amazon-apigateway-integration": integration },
        },
      },
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused rather than turned into a route key AWS may not have
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/trace: an HTTP API route key with " +
        "a TRACE method is not established",
    );
  });

  it("refuses a path item reference", async () => {
    // Given a path item written as a reference to another one
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: { "/orders": { $ref: "#/components/pathItems/orders" } },
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused, since only the integration reference is resolved
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/$ref: a path item reference is not " +
        "resolved",
    );
  });

  it("refuses a catch-all method extension", async () => {
    // Given a path item declaring one method for everything
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          "x-amazon-apigateway-any-method": {
            "x-amazon-apigateway-integration": integration,
          },
        },
      },
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused rather than turned into an ANY route key
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/x-amazon-apigateway-any-method: a " +
        "catch-all method",
    );
  });

  it("refuses an operation with no integration behind it", async () => {
    // Given an operation declaring only its responses
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": { get: { responses: { "200": { description: "ok" } } } },
      },
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused rather than creating a route with nothing behind it
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/x-amazon-apigateway-" +
        "integration: is required",
    );
  });

  it("refuses a malformed route key where CreateRoute refuses it", async () => {
    // Given a path that is not a path at all
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        orders: { get: { "x-amazon-apigateway-integration": integration } },
      },
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then the refusal CreateRoute makes is given the pointer of the operation
    // that produced it, so the reader is sent into their own document
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/orders/get",
    );
  });
});
