import {
  GetMethodCommand,
  GetResourcesCommand,
  GetRestApisCommand,
  ImportRestApiCommand,
  PutRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import {
  assertIdentical,
  assertNonNullable,
  assertStringMatches,
  assertTrue,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simRestApiOpenApiDocumentFactory } from "./sim-rest-api-openapi-document.factory.js";
import { simRestApiOpenApiIntegrationFactory } from "./sim-rest-api-openapi-integration.factory.js";

const integration = simRestApiOpenApiIntegrationFactory.make();

/**
 * A document as an SDK caller carries it, which is the request body bytes.
 */
function definitionOf(document: object): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(document));
}

/**
 * Import a document the way an SDK caller does.
 */
function importCommand(document: object): ImportRestApiCommand {
  return new ImportRestApiCommand({ body: definitionOf(document) });
}

describe("Importing a sim REST API from an OpenAPI document", () => {
  it("creates the API, and a resource and method per operation", async () => {
    // Given a document declaring two operations on one path
    const simAws = new SimAws();
    const document = simRestApiOpenApiDocumentFactory.make({
      title: "pets",
      paths: {
        "/pets": {
          get: { "x-amazon-apigateway-integration": integration },
          post: { "x-amazon-apigateway-integration": integration },
        },
      },
    });

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(document));

    // Then the API is named by the document, and the path became a resource
    // carrying a method per operation
    assertStringMatches(imported.id, /^[a-z0-9]+$/);
    assertIdentical(imported.name, "pets");

    const resources = await simAws.apiGateway().getResources(
      new GetResourcesCommand({
        restApiId: imported.id,
        embed: ["methods"],
      }),
    );
    expect(resources.items.map((resource) => resource.path)).toStrictEqual([
      "/",
      "/pets",
    ]);
    const pets = resources.items[1];
    assertNonNullable(pets?.resourceMethods);
    expect(Object.keys(pets.resourceMethods)).toStrictEqual(["GET", "POST"]);
  });

  it("puts the declared Lambda proxy integration behind the method", async () => {
    // Given a document whose operation names a function
    const simAws = new SimAws();
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/pets": {
          get: {
            "x-amazon-apigateway-integration":
              simRestApiOpenApiIntegrationFactory.make({
                functionArn:
                  "arn:aws:lambda:us-east-1:555555555555:function:Pets",
              }),
          },
        },
      },
    });

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(document));

    // Then the method carries the proxy integration the document declared,
    // with the URI as it was written
    const resources = await simAws
      .apiGateway()
      .getResources(new GetResourcesCommand({ restApiId: imported.id }));
    const pets = resources.items.find((resource) => resource.path === "/pets");
    assertNonNullable(pets);
    const method = await simAws.apiGateway().getMethod(
      new GetMethodCommand({
        restApiId: imported.id,
        resourceId: pets.id,
        httpMethod: "GET",
      }),
    );
    assertIdentical(method.authorizationType, "NONE");
    const { methodIntegration } = method;
    assertNonNullable(methodIntegration);
    assertIdentical(methodIntegration.type, "AWS_PROXY");
    assertIdentical(methodIntegration.httpMethod, "POST");
    assertIdentical(
      methodIntegration.uri,
      "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/" +
        "arn:aws:lambda:us-east-1:555555555555:function:Pets/invocations",
    );
  });

  it("builds one node per path segment, shared between paths", async () => {
    // Given two paths, the deeper one written first
    const simAws = new SimAws();
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/pets/{petId}": {
          get: { "x-amazon-apigateway-integration": integration },
        },
        "/pets": {
          get: { "x-amazon-apigateway-integration": integration },
        },
      },
    });

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(document));

    // Then `pets` is one node with `{petId}` under it, whichever path reached
    // it first, and the parameter is a path part rather than a literal
    const resources = await simAws
      .apiGateway()
      .getResources(new GetResourcesCommand({ restApiId: imported.id }));
    expect(resources.items.map((resource) => resource.path)).toStrictEqual([
      "/",
      "/pets",
      "/pets/{petId}",
    ]);
    const [, pets, petId] = resources.items;
    assertNonNullable(pets);
    assertNonNullable(petId);
    assertIdentical(petId.pathPart, "{petId}");
    assertIdentical(petId.parentId, pets.id);
  });

  it("takes a greedy path parameter as a greedy resource", async () => {
    // Given a document whose path ends in a greedy parameter
    const simAws = new SimAws();
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/{proxy+}": {
          get: { "x-amazon-apigateway-integration": integration },
        },
      },
    });

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(document));

    // Then the resource carries the greedy part, which is what makes it match
    // the rest of a request path
    const resources = await simAws
      .apiGateway()
      .getResources(new GetResourcesCommand({ restApiId: imported.id }));
    assertIdentical(resources.items[1]?.pathPart, "{proxy+}");
    const restApi = simAws.apiGateway().findRestApi(imported.id);
    assertTrue(
      restApi?.resources.findByPath("/{proxy+}")?.greedy === true,
      "The imported resource should capture the rest of the path",
    );
  });

  it("declares an ANY method from the catch-all operation key", async () => {
    // Given a path carrying the catch-all extension alongside a method of its
    // own
    const simAws = new SimAws();
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/pets": {
          get: { "x-amazon-apigateway-integration": integration },
          "x-amazon-apigateway-any-method": {
            "x-amazon-apigateway-integration": integration,
          },
        },
      },
    });

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(document));

    // Then the extension became an ANY method, which serves every method the
    // resource declares no method of its own for
    const resources = await simAws.apiGateway().getResources(
      new GetResourcesCommand({
        restApiId: imported.id,
        embed: ["methods"],
      }),
    );
    const pets = resources.items[1];
    assertNonNullable(pets?.resourceMethods);
    expect(Object.keys(pets.resourceMethods)).toStrictEqual(["GET", "ANY"]);
  });

  it("declares methods on the root resource for the root path", async () => {
    // Given a document whose only path is the root
    const simAws = new SimAws();
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/": { get: { "x-amazon-apigateway-integration": integration } },
      },
    });

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(document));

    // Then the method is on the root resource the API was created with, and no
    // node was added under it
    const resources = await simAws.apiGateway().getResources(
      new GetResourcesCommand({
        restApiId: imported.id,
        embed: ["methods"],
      }),
    );
    expect(resources.items).toHaveLength(1);
    assertIdentical(resources.items[0]?.id, imported.rootResourceId);
    assertNonNullable(resources.items[0].resourceMethods?.["GET"]);
  });

  it("leaves no API behind when the document is refused", async () => {
    // Given a document whose second operation this simulation cannot apply
    const simAws = new SimAws();
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/pets": { get: { "x-amazon-apigateway-integration": integration } },
        "/owners": {
          get: {
            "x-amazon-apigateway-integration": { type: "mock", uri: "unused" },
          },
        },
      },
    });

    // When it is imported
    const importing = simAws
      .apiGateway()
      .importRestApi(importCommand(document));

    // Then the import is refused, and the API the first path had already
    // created is gone, since a half-imported API serves some of its paths and
    // answers 403 for the rest
    await expect(importing).rejects.toThrow(
      /#\/paths\/~1owners\/get\/x-amazon-apigateway-integration/,
    );
    const remaining = await simAws
      .apiGateway()
      .getRestApis(new GetRestApisCommand({}));
    expect(remaining.items).toStrictEqual([]);
  });

  it("replaces an API's whole definition through PutRestApi", async () => {
    // Given an imported API serving one path
    const simAws = new SimAws();
    const pets = simRestApiOpenApiDocumentFactory.make({
      title: "pets",
      paths: {
        "/pets": { get: { "x-amazon-apigateway-integration": integration } },
      },
    });
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(pets));

    // When another document is put over it
    const owners = simRestApiOpenApiDocumentFactory.make({
      title: "owners",
      paths: {
        "/owners": { get: { "x-amazon-apigateway-integration": integration } },
      },
    });
    const replaced = await simAws.apiGateway().putRestApi(
      new PutRestApiCommand({
        restApiId: imported.id,
        mode: "overwrite",
        body: definitionOf(owners),
      }),
    );

    // Then the API is the same one, under the new document's name, and the
    // path the old definition served is gone
    assertIdentical(replaced.id, imported.id);
    assertIdentical(replaced.name, "owners");
    const resources = await simAws
      .apiGateway()
      .getResources(new GetResourcesCommand({ restApiId: imported.id }));
    expect(resources.items.map((resource) => resource.path)).toStrictEqual([
      "/",
      "/owners",
    ]);
  });

  it("empties the path tree when a replacement is refused", async () => {
    // Given an imported API serving one path
    const simAws = new SimAws();
    const pets = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/pets": { get: { "x-amazon-apigateway-integration": integration } },
      },
    });
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(pets));

    // When a document this simulation cannot apply is put over it
    const owners = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/owners": {
          get: {
            "x-amazon-apigateway-integration": {
              type: "aws_proxy",
              uri: "not-a-function-arn",
            },
          },
        },
      },
    });
    const putting = simAws.apiGateway().putRestApi(
      new PutRestApiCommand({
        restApiId: imported.id,
        mode: "overwrite",
        body: definitionOf(owners),
      }),
    );

    // Then the replacement is refused, and the API is left serving nothing
    // rather than half of each document
    await expect(putting).rejects.toThrow(/#\/paths\/~1owners\/get/);
    const resources = await simAws
      .apiGateway()
      .getResources(new GetResourcesCommand({ restApiId: imported.id }));
    expect(resources.items.map((resource) => resource.path)).toStrictEqual([
      "/",
    ]);
  });
});
