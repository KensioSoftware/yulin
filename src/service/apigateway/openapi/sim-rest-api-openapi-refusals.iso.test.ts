import {
  ImportRestApiCommand,
  PutRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { simRestApiOpenApiDocumentFactory } from "./sim-rest-api-openapi-document.factory.js";
import { simRestApiOpenApiIntegrationFactory } from "./sim-rest-api-openapi-integration.factory.js";

const integration = simRestApiOpenApiIntegrationFactory.make();

/**
 * Import a serialised document, whatever it holds.
 */
async function importing(simAws: SimAws, body: string): Promise<unknown> {
  const command = new ImportRestApiCommand({
    body: new TextEncoder().encode(body),
  });

  return await simAws.apiGateway().importRestApi(command);
}

/**
 * Import a document built around one path item.
 */
async function importingPath(
  simAws: SimAws,
  path: string,
  item: JSONObject,
): Promise<unknown> {
  const document = simRestApiOpenApiDocumentFactory.make({
    paths: { [path]: item },
  });

  return await importing(simAws, JSON.stringify(document));
}

describe("Refusing an OpenAPI document a sim REST API cannot serve", () => {
  it("refuses a document that is not OpenAPI 3.0", async () => {
    // Given documents of the two versions this simulation does not read
    const simAws = new SimAws();

    // When each is imported
    // Then each is refused by version rather than read as far as it agrees
    await expect(
      importing(simAws, JSON.stringify({ swagger: "2.0", paths: {} })),
    ).rejects.toThrow(/#\/swagger: a Swagger 2 document is not simulated/);
    const openApi31 = simRestApiOpenApiDocumentFactory.make({
      openapi: "3.1.0",
    });
    await expect(importing(simAws, JSON.stringify(openApi31))).rejects.toThrow(
      "#/openapi: is '3.1.0'",
    );
  });

  it("refuses a body that is not a JSON document", async () => {
    // Given a document written as YAML
    const simAws = new SimAws();

    // When it is imported
    // Then it is refused, since nothing here parses YAML
    await expect(importing(simAws, "openapi: 3.0.1\n")).rejects.toThrow(
      /#: is not a JSON document, and YAML is not parsed/,
    );
  });

  it("refuses the root members that change what the API serves", async () => {
    // Given documents carrying each of them
    const simAws = new SimAws();
    const refused: readonly (readonly [string, JSONValue])[] = [
      ["servers", [{ url: "https://pets.example.com/v1" }]],
      ["security", [{ "pet-authorizer": [] }]],
      ["x-amazon-apigateway-policy", { Statement: [] }],
      ["x-amazon-apigateway-binary-media-types", ["image/png"]],
      ["x-amazon-apigateway-gateway-responses", {}],
      ["x-amazon-apigateway-request-validators", {}],
      ["x-amazon-apigateway-api-key-source", "HEADER"],
      ["x-amazon-apigateway-endpoint-configuration", {}],
      ["x-amazon-apigateway-minimum-compression-size", 1024],
    ];

    // When each is imported
    // Then each is refused naming the member, rather than dropped
    await Promise.all(
      refused.map(async ([member, value]) => {
        const document = {
          ...simRestApiOpenApiDocumentFactory.make(),
          [member]: value,
        };

        await expect(
          importing(simAws, JSON.stringify(document)),
        ).rejects.toThrow(`#/${member}: `);
      }),
    );
  });

  it("refuses a path item member that is not an operation", async () => {
    // Given a path item carrying a TRACE operation and one carrying a
    // reference
    const simAws = new SimAws();

    // When each is imported
    // Then each is refused, since a REST API has no method for either
    await expect(
      importingPath(simAws, "/pets", {
        trace: { "x-amazon-apigateway-integration": integration },
      }),
    ).rejects.toThrow(/#\/paths\/~1pets\/trace: a REST API method cannot/);
    await expect(
      importingPath(simAws, "/pets", { $ref: "#/components/pathItems/pets" }),
    ).rejects.toThrow(/#\/paths\/~1pets\/\$ref: a path item reference/);
  });

  it("refuses a path that is not one written from the root", async () => {
    // Given a path with no leading separator and one with an empty segment
    const simAws = new SimAws();
    const item = { get: { "x-amazon-apigateway-integration": integration } };

    // When each is imported
    // Then each is refused, rather than being normalised into a path the
    // document did not write
    await expect(importingPath(simAws, "pets", item)).rejects.toThrow(
      /#\/paths\/pets: is 'pets', and a path is written from the root/,
    );
    await expect(importingPath(simAws, "/pets/", item)).rejects.toThrow(
      /#\/paths\/~1pets~1: is '\/pets\/', which has an empty segment/,
    );
  });

  it("refuses an operation that says who may call it", async () => {
    // Given an operation naming a security scheme
    const simAws = new SimAws();

    // When it is imported
    // Then it is refused, because authorizing a REST API method is not
    // simulated and an open method is not what the document asked for
    await expect(
      importingPath(simAws, "/pets", {
        get: {
          security: [{ "pet-authorizer": [] }],
          "x-amazon-apigateway-integration": integration,
        },
      }),
    ).rejects.toThrow(
      /#\/paths\/~1pets\/get\/security: a security requirement names the/,
    );
  });

  it("refuses an operation with no integration behind it", async () => {
    // Given an operation declaring only its responses
    const simAws = new SimAws();

    // When it is imported
    // Then it is refused, since the method would answer 500
    await expect(
      importingPath(simAws, "/pets", {
        get: { responses: { "200": { description: "200 response" } } },
      }),
    ).rejects.toThrow(
      /x-amazon-apigateway-integration: is required: an operation with no/,
    );
  });

  it("refuses an integration member it would not apply", async () => {
    // Given integrations carrying each of them
    const simAws = new SimAws();
    const refused: readonly (readonly [string, JSONValue])[] = [
      ["requestTemplates", { "application/json": "{}" }],
      ["requestParameters", {}],
      ["responses", {}],
      ["passthroughBehavior", "when_no_match"],
      ["contentHandling", "CONVERT_TO_TEXT"],
      ["credentials", "arn:aws:iam::111111111111:role/Pets"],
      ["timeoutInMillis", 29_000],
      ["cacheNamespace", "pets"],
      ["cacheKeyParameters", []],
      ["connectionType", "VPC_LINK"],
      ["connectionId", "abcdef"],
      ["tlsConfig", {}],
    ];

    // When each is imported
    // Then each is refused naming the member, since a Lambda proxy
    // integration here does none of it
    await Promise.all(
      refused.map(async ([member, value]) => {
        const declared = { ...integration, [member]: value };

        await expect(
          importingPath(simAws, "/pets", {
            get: { "x-amazon-apigateway-integration": declared },
          }),
        ).rejects.toThrow(
          `x-amazon-apigateway-integration/${member}: configures`,
        );
      }),
    );
  });

  it("refuses an integration declared some other way", async () => {
    // Given a reference, a method that is not POST, and a type that is not a
    // Lambda proxy
    const simAws = new SimAws();

    // When each is imported
    // Then each is refused where it is written
    await expect(
      importingPath(simAws, "/pets", {
        get: {
          "x-amazon-apigateway-integration": {
            $ref: "#/components/x-amazon-apigateway-integrations/pets",
          },
        },
      }),
    ).rejects.toThrow(
      /x-amazon-apigateway-integration\/\$ref: a reusable integration/,
    );
    await expect(
      importingPath(simAws, "/pets", {
        get: {
          "x-amazon-apigateway-integration": {
            ...integration,
            httpMethod: "GET",
          },
        },
      }),
    ).rejects.toThrow(
      /x-amazon-apigateway-integration\/httpMethod: is 'GET', and a Lambda/,
    );
    await expect(
      importingPath(simAws, "/pets", {
        get: {
          "x-amazon-apigateway-integration": {
            ...integration,
            type: "http_proxy",
          },
        },
      }),
    ).rejects.toThrow(/PutIntegration type 'HTTP_PROXY' is not simulated/);
  });

  it("refuses the import inputs outside what it reads", async () => {
    // Given a valid document
    const simAws = new SimAws();
    const body = new TextEncoder().encode(
      JSON.stringify(simRestApiOpenApiDocumentFactory.make()),
    );

    // When it is imported with the lenient warning handling, or with the
    // parameters that configure an endpoint type or a base path
    // Then each is refused rather than dropped
    const lenient = new ImportRestApiCommand({ body, failOnWarnings: false });
    await expect(simAws.apiGateway().importRestApi(lenient)).rejects.toThrow(
      "ImportRestApi failOnWarnings false is not simulated",
    );

    const parameterised = new ImportRestApiCommand({
      body,
      parameters: { basepath: "prepend" },
    });
    await expect(
      simAws.apiGateway().importRestApi(parameterised),
    ).rejects.toThrow("ImportRestApi parameters is not simulated");
  });

  it("refuses a PutRestApi that merges rather than replaces", async () => {
    // Given an API and a document to put over it
    const simAws = new SimAws();
    const body = new TextEncoder().encode(
      JSON.stringify(simRestApiOpenApiDocumentFactory.make()),
    );
    const imported = await simAws
      .apiGateway()
      .importRestApi(new ImportRestApiCommand({ body }));

    // When the mode is left out, which AWS takes as merge, and when merge is
    // asked for
    // Then each is refused, since which of two declarations of one method a
    // merge keeps decides what every request to it reaches
    await Promise.all(
      ([undefined, "merge"] as const).map(async (mode) => {
        const putting = new PutRestApiCommand({
          restApiId: imported.id,
          mode,
          body,
        });

        await expect(simAws.apiGateway().putRestApi(putting)).rejects.toThrow(
          "PutRestApi mode 'merge' is not simulated",
        );
      }),
    );
  });
});
