import { ImportApiCommand } from "@aws-sdk/client-apigatewayv2";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import type { JSONObject } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiOpenApiDocumentFactory } from "./sim-http-api-openapi-document.factory.js";
import { simHttpApiOpenApiIntegrationFactory } from "./sim-http-api-openapi-integration.factory.js";

const integration = simHttpApiOpenApiIntegrationFactory.make();

const proxyUri =
  "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/" +
  "arn:aws:lambda:us-east-1:111111111111:function:orders/invocations";

/**
 * A document whose one operation carries the integration under test.
 */
function documentWith(declared: JSONObject): string {
  return JSON.stringify(
    simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": { get: { "x-amazon-apigateway-integration": declared } },
      },
    }),
  );
}

describe("What a sim HTTP API import refuses in an integration", () => {
  it("refuses a Lambda proxy integration declared with another method", async () => {
    // Given an integration whose httpMethod is the route's method
    const simAws = new SimAws();

    // When it is imported
    const importing = simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: documentWith({ ...integration, httpMethod: "GET" }),
      }),
    );

    // Then it is refused: POST is the method API Gateway calls Lambda's invoke
    // API with, rather than the method the route matches
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/x-amazon-apigateway-" +
        "integration/httpMethod: is 'GET'",
    );
  });

  it("refuses an integrationMethod rather than reading it", async () => {
    // Given an integration naming the method it calls its target with
    const simAws = new SimAws();

    // When it is imported
    const importing = simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: documentWith({ ...integration, integrationMethod: "POST" }),
      }),
    );

    // Then it is refused by name
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/x-amazon-apigateway-" +
        "integration/integrationMethod",
    );
  });

  it("refuses an integration with no payload format", async () => {
    // Given an integration that does not say which event shape it wants
    const simAws = new SimAws();
    const body = documentWith({
      type: "aws_proxy",
      httpMethod: "POST",
      uri: proxyUri,
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: body }));

    // Then it is refused, naming the member the document has to carry
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/x-amazon-apigateway-" +
        "integration/payloadFormatVersion: is required",
    );
  });

  it("refuses payload format 1.0 with the reason CreateIntegration gives", async () => {
    // Given an integration asking for the older event shape
    const simAws = new SimAws();

    // When it is imported
    const importing = simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: documentWith({ ...integration, payloadFormatVersion: "1.0" }),
      }),
    );

    // Then the refusal is the one an SDK caller gets, under the pointer of the
    // integration that produced it
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/x-amazon-apigateway-" +
        "integration: CreateIntegration PayloadFormatVersion '1.0' is not " +
        "simulated",
    );
  });

  it("refuses an HTTP proxy integration by name", async () => {
    // Given an integration forwarding to another endpoint
    const simAws = new SimAws();

    // When it is imported
    const importing = simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: documentWith({
          type: "http_proxy",
          httpMethod: "GET",
          uri: "https://orders.example.com",
          payloadFormatVersion: "1.0",
        }),
      }),
    );

    // Then it is refused as the deferred thing it is, rather than as an
    // unknown integration type
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/x-amazon-apigateway-" +
        "integration/type: is an HTTP proxy integration",
    );
  });

  it("refuses any other integration type", async () => {
    // Given a mock integration, which answers without a target at all
    const simAws = new SimAws();

    // When it is imported
    const importing = simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: documentWith({ ...integration, type: "mock" }),
      }),
    );

    // Then CreateIntegration refuses it with the reason it refuses it
    await expect(importing).rejects.toThrow(
      "CreateIntegration IntegrationType 'MOCK' is not simulated",
    );
  });

  it("refuses an integration with no URI", async () => {
    // Given an integration naming no target
    const simAws = new SimAws();
    const body = documentWith({
      type: "aws_proxy",
      httpMethod: "POST",
      payloadFormatVersion: "2.0",
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: body }));

    // Then it is refused, naming the member
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/x-amazon-apigateway-" +
        "integration/uri: is required",
    );
  });

  it("refuses the members a deferred integration feature configures", async () => {
    // Given integrations asking for each of them
    const simAws = new SimAws();
    const deferred = [
      "integrationSubtype",
      "requestParameters",
      "credentials",
      "tlsConfig",
      "responseTransferMode",
      "connectionId",
      "connectionType",
    ];

    // When each is imported
    const refusals = await Promise.all(
      deferred.map(async (member) => {
        const body = documentWith({ ...integration, [member]: "anything" });
        const [outcome] = await Promise.allSettled([
          simAws.apiGatewayV2().importApi(new ImportApiCommand({ Body: body })),
        ]);
        assertNonNullable(outcome);

        return { member, outcome };
      }),
    );

    // Then every one is refused by name rather than dropped
    for (const { member, outcome } of refusals) {
      assertIdentical(outcome.status, "rejected");
      expect(String(outcome.reason)).toContain(
        `x-amazon-apigateway-integration/${member}`,
      );
    }
  });

  it("refuses a reference pointing anywhere but the integration definitions", async () => {
    // Given an operation referencing a schema
    const simAws = new SimAws();

    // When it is imported
    const importing = simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: documentWith({ $ref: "#/components/schemas/Order" }),
      }),
    );

    // Then the pointer it names is refused, since nothing here resolves it
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/x-amazon-apigateway-" +
        "integration/$ref: points at '#/components/schemas/Order'",
    );
  });

  it("refuses a reference to a definition the document does not carry", async () => {
    // Given a reference into the integration definitions, and no such one
    const simAws = new SimAws();

    // When it is imported
    const importing = simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: documentWith({
          $ref: "#/components/x-amazon-apigateway-integrations/billing",
        }),
      }),
    );

    // Then it is refused rather than creating a route with nothing behind it
    await expect(importing).rejects.toThrow(
      "names the integration definition 'billing', which " +
        "#/components/x-amazon-apigateway-integrations does not carry",
    );
  });

  it("refuses an integration that is not an object", async () => {
    // Given an operation whose integration is a string
    const simAws = new SimAws();
    const document = simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": { get: { "x-amazon-apigateway-integration": "orders" } },
      },
    });

    // When it is imported
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: JSON.stringify(document) }));

    // Then it is refused as the wrong shape
    await expect(importing).rejects.toThrow(
      "ImportApi refused #/paths/~1orders/get/x-amazon-apigateway-" +
        "integration: has to be an object",
    );
  });
});
