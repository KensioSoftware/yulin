import {
  GetAuthorizersCommand,
  GetMethodCommand,
  GetResourcesCommand,
  ImportRestApiCommand,
  PutRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simRestApiOpenApiDocumentFactory } from "./sim-rest-api-openapi-document.factory.js";
import { simRestApiOpenApiIntegrationFactory } from "./sim-rest-api-openapi-integration.factory.js";

const integration = simRestApiOpenApiIntegrationFactory.make();

const authorizerUri =
  "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/" +
  "arn:aws:lambda:us-east-1:555555555555:function:PetAuthorizer/invocations";

const userPoolArn =
  "arn:aws:cognito-idp:us-east-1:111111111111:userpool/us-east-1_aBcDeFgHi";

/**
 * The scheme a document declares a `TOKEN` authorizer with, which reads the
 * header the scheme itself names.
 */
const tokenScheme: JSONObject = {
  type: "apiKey",
  name: "Authorization",
  in: "header",
  "x-amazon-apigateway-authtype": "custom",
  "x-amazon-apigateway-authorizer": {
    type: "token",
    authorizerUri,
    authorizerResultTtlInSeconds: 300,
  },
};

/**
 * A document whose one operation is gated by the scheme under test.
 */
function gatedDocument(
  scheme: JSONObject,
  security: JSONValue = [{ "pet-authorizer": [] }],
): object {
  return simRestApiOpenApiDocumentFactory.make({
    paths: {
      "/pets": {
        get: { security, "x-amazon-apigateway-integration": integration },
      },
    },
    components: { securitySchemes: { "pet-authorizer": scheme } },
  });
}

/**
 * Import a document the way an SDK caller does.
 */
function importCommand(document: object): ImportRestApiCommand {
  return new ImportRestApiCommand({
    body: new TextEncoder().encode(JSON.stringify(document)),
  });
}

/**
 * The method one path of an imported API declares.
 */
async function methodOf(
  simAws: SimAws,
  restApiId: string,
  path: string,
  httpMethod = "GET",
): Promise<{
  readonly authorizationType?: string | undefined;
  readonly authorizerId?: string | undefined;
  readonly authorizationScopes?: string[] | undefined;
}> {
  const resources = await simAws
    .apiGateway()
    .getResources(new GetResourcesCommand({ restApiId }));
  const resource = resources.items.find((one) => one.path === path);
  assertNonNullable(resource);

  return await simAws
    .apiGateway()
    .getMethod(
      new GetMethodCommand({ restApiId, resourceId: resource.id, httpMethod }),
    );
}

describe("Importing a sim REST API's authorizers from its security schemes", () => {
  it("creates one Lambda authorizer named after the security scheme", async () => {
    // Given a document whose operation names a token authorizer's scheme
    const simAws = new SimAws();

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(gatedDocument(tokenScheme)));

    // Then the scheme key named the authorizer, its identity source is the
    // header the scheme itself names, and it holds its decisions for the
    // period the document asked for
    const authorizers = await simAws
      .apiGateway()
      .getAuthorizers(new GetAuthorizersCommand({ restApiId: imported.id }));
    expect(authorizers.items).toHaveLength(1);
    const [authorizer] = authorizers.items;
    assertNonNullable(authorizer);
    assertIdentical(authorizer.name, "pet-authorizer");
    assertIdentical(authorizer.type, "TOKEN");
    assertIdentical(authorizer.authType, "custom");
    assertIdentical(authorizer.authorizerUri, authorizerUri);
    assertIdentical(
      authorizer.identitySource,
      "method.request.header.Authorization",
    );
    assertIdentical(authorizer.authorizerResultTtlInSeconds, 300);

    // And the method the operation became sends its requests through it
    const method = await methodOf(simAws, imported.id, "/pets");
    assertIdentical(method.authorizationType, "CUSTOM");
    assertIdentical(method.authorizerId, authorizer.id);
  });

  it("creates a REQUEST authorizer from the expressions it names", async () => {
    // Given a scheme whose authorizer identifies a caller by two request
    // parameters of its own
    const simAws = new SimAws();
    const scheme: JSONObject = {
      type: "apiKey",
      name: "Unused",
      in: "header",
      "x-amazon-apigateway-authtype": "custom",
      "x-amazon-apigateway-authorizer": {
        type: "request",
        authorizerUri,
        identitySource:
          "method.request.header.Authorization, method.request.querystring.pet",
      },
    };

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(gatedDocument(scheme)));

    // Then the authorizer reads both, rather than the header the scheme names
    const authorizers = await simAws
      .apiGateway()
      .getAuthorizers(new GetAuthorizersCommand({ restApiId: imported.id }));
    const [authorizer] = authorizers.items;
    assertNonNullable(authorizer);
    assertIdentical(authorizer.type, "REQUEST");
    assertIdentical(
      authorizer.identitySource,
      "method.request.header.Authorization,method.request.querystring.pet",
    );
    const method = await methodOf(simAws, imported.id, "/pets");
    assertIdentical(method.authorizationType, "CUSTOM");
  });

  it("creates a Cognito authorizer, with the scopes the requirement asks for", async () => {
    // Given a scheme declaring a user pool authorizer, named by an operation
    // asking a token for one scope
    const simAws = new SimAws();
    const scheme: JSONObject = {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      "x-amazon-apigateway-authtype": "cognito_user_pools",
      "x-amazon-apigateway-authorizer": {
        type: "cognito_user_pools",
        providerARNs: [userPoolArn],
      },
    };

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(
        importCommand(
          gatedDocument(scheme, [{ "pet-authorizer": ["pets.read"] }]),
        ),
      );

    // Then the authorizer verifies tokens the named pool issued, and invokes
    // nothing
    const authorizers = await simAws
      .apiGateway()
      .getAuthorizers(new GetAuthorizersCommand({ restApiId: imported.id }));
    const [authorizer] = authorizers.items;
    assertNonNullable(authorizer);
    assertIdentical(authorizer.type, "COGNITO_USER_POOLS");
    expect(authorizer.providerARNs).toStrictEqual([userPoolArn]);
    assertUndefined(authorizer.authorizerUri);

    // And the method checks the token for the scope the requirement named
    const method = await methodOf(simAws, imported.id, "/pets");
    assertIdentical(method.authorizationType, "COGNITO_USER_POOLS");
    assertIdentical(method.authorizerId, authorizer.id);
    expect(method.authorizationScopes).toStrictEqual(["pets.read"]);
  });

  it("gives a method named by an awsSigv4 scheme IAM authorization", async () => {
    // Given a scheme declaring IAM authorization, which asks no authorizer
    // anything
    const simAws = new SimAws();
    const scheme: JSONObject = {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      "x-amazon-apigateway-authtype": "awsSigv4",
    };

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(gatedDocument(scheme)));

    // Then the method is decided by IAM, and the API has no authorizer
    const method = await methodOf(simAws, imported.id, "/pets");
    assertIdentical(method.authorizationType, "AWS_IAM");
    assertUndefined(method.authorizerId);
    const authorizers = await simAws
      .apiGateway()
      .getAuthorizers(new GetAuthorizersCommand({ restApiId: imported.id }));
    expect(authorizers.items).toStrictEqual([]);
  });

  it("gives a method carrying x-amazon-apigateway-auth IAM authorization", async () => {
    // Given an operation declaring IAM authorization on the extension rather
    // than through a security scheme
    const simAws = new SimAws();
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/pets": {
          get: {
            "x-amazon-apigateway-auth": { type: "AWS_IAM" },
            "x-amazon-apigateway-integration": integration,
          },
        },
      },
    });

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(document));

    // Then the method is decided by IAM, which is the one authorization the
    // extension declares
    const method = await methodOf(simAws, imported.id, "/pets");
    assertIdentical(method.authorizationType, "AWS_IAM");
  });

  it("shares one authorizer between every operation naming the scheme", async () => {
    // Given two operations naming the same scheme
    const simAws = new SimAws();
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/pets": {
          get: {
            security: [{ "pet-authorizer": [] }],
            "x-amazon-apigateway-integration": integration,
          },
          post: {
            security: [{ "pet-authorizer": [] }],
            "x-amazon-apigateway-integration": integration,
          },
        },
      },
      components: { securitySchemes: { "pet-authorizer": tokenScheme } },
    });

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(document));

    // Then the authorizer was created once, as a REST API authorizer belongs
    // to the API rather than to a method, and both methods name it
    const authorizers = await simAws
      .apiGateway()
      .getAuthorizers(new GetAuthorizersCommand({ restApiId: imported.id }));
    expect(authorizers.items).toHaveLength(1);
    const [authorizer] = authorizers.items;
    assertNonNullable(authorizer);
    const get = await methodOf(simAws, imported.id, "/pets");
    const post = await methodOf(simAws, imported.id, "/pets", "POST");
    assertIdentical(get.authorizerId, authorizer.id);
    assertIdentical(post.authorizerId, authorizer.id);
  });

  it("leaves an operation naming no scheme open", async () => {
    // Given a document declaring a scheme, and an operation that does not name
    // it
    const simAws = new SimAws();
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/pets": { get: { "x-amazon-apigateway-integration": integration } },
      },
      components: { securitySchemes: { "pet-authorizer": tokenScheme } },
    });

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(document));

    // Then the method is open, and the scheme nothing named created nothing
    const method = await methodOf(simAws, imported.id, "/pets");
    assertIdentical(method.authorizationType, "NONE");
    const authorizers = await simAws
      .apiGateway()
      .getAuthorizers(new GetAuthorizersCommand({ restApiId: imported.id }));
    expect(authorizers.items).toStrictEqual([]);
  });

  it("replaces the authorizers of the definition a PutRestApi puts over", async () => {
    // Given an imported API gated by a scheme's authorizer
    const simAws = new SimAws();
    const imported = await simAws
      .apiGateway()
      .importRestApi(importCommand(gatedDocument(tokenScheme)));

    // When the same document is put over it
    const replacement = new TextEncoder().encode(
      JSON.stringify(gatedDocument(tokenScheme)),
    );
    await simAws.apiGateway().putRestApi(
      new PutRestApiCommand({
        restApiId: imported.id,
        mode: "overwrite",
        body: replacement,
      }),
    );

    // Then the API is gated by the replacement's one authorizer rather than by
    // that one and the authorizer the first import left behind
    const authorizers = await simAws
      .apiGateway()
      .getAuthorizers(new GetAuthorizersCommand({ restApiId: imported.id }));
    expect(authorizers.items).toHaveLength(1);
    const [authorizer] = authorizers.items;
    assertNonNullable(authorizer);
    const method = await methodOf(simAws, imported.id, "/pets");
    assertIdentical(method.authorizerId, authorizer.id);
  });
});
