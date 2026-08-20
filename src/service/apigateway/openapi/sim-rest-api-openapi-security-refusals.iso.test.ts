import { ImportRestApiCommand } from "@aws-sdk/client-api-gateway";
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
 * Import a document built around one operation, whatever it says about who may
 * call it.
 */
async function importingOperation(
  simAws: SimAws,
  operation: JSONObject,
  components: JSONObject = {},
): Promise<unknown> {
  const document = simRestApiOpenApiDocumentFactory.make({
    paths: {
      "/pets": {
        get: { ...operation, "x-amazon-apigateway-integration": integration },
      },
    },
    components,
  });

  const body = new TextEncoder().encode(JSON.stringify(document));

  return await simAws
    .apiGateway()
    .importRestApi(new ImportRestApiCommand({ body }));
}

/**
 * Import a document whose one operation names the scheme under test.
 */
async function importingScheme(
  simAws: SimAws,
  scheme: JSONObject,
  scopes: string[] = [],
): Promise<unknown> {
  return await importingOperation(
    simAws,
    { security: [{ "pet-authorizer": scopes }] },
    { securitySchemes: { "pet-authorizer": scheme } },
  );
}

/**
 * A `custom` scheme carrying the authorizer members under test.
 */
function customScheme(authorizer: JSONObject): JSONObject {
  return {
    type: "apiKey",
    name: "Authorization",
    in: "header",
    "x-amazon-apigateway-authtype": "custom",
    "x-amazon-apigateway-authorizer": {
      type: "token",
      authorizerUri,
      ...authorizer,
    },
  };
}

describe("Refusing a security scheme a sim REST API cannot be gated by", () => {
  it("refuses a scheme that is not an apiKey one", async () => {
    // Given the scheme types a REST API declares no authorizer under
    const simAws = new SimAws();
    const refused: readonly JSONObject[] = [
      { type: "http", scheme: "basic" },
      { type: "oauth2", flows: {} },
      { type: "openIdConnect", openIdConnectUrl: "https://pets.example.com" },
    ];

    // When each is imported
    // Then each is refused where it is written, since a REST API writes
    // every authorizer it has as an apiKey scheme
    await Promise.all(
      refused.map(async (scheme) => {
        await expect(importingScheme(simAws, scheme)).rejects.toThrow(
          /#\/components\/securitySchemes\/pet-authorizer\/type: is not 'apiKey'/,
        );
      }),
    );
  });

  it("refuses an apiKey scheme declaring an API key", async () => {
    // Given a scheme carrying no authtype, which is what an API key is
    const simAws = new SimAws();
    const scheme: JSONObject = {
      type: "apiKey",
      name: "x-api-key",
      in: "header",
    };

    // When it is imported
    // Then it is refused, since API keys and usage plans are not simulated
    await expect(importingScheme(simAws, scheme)).rejects.toThrow(
      /x-amazon-apigateway-authtype: is required: an apiKey scheme carrying/,
    );
  });

  it("refuses an authtype no REST API authorization is declared with", async () => {
    // Given a scheme declaring an authtype from another API kind
    const simAws = new SimAws();
    const scheme: JSONObject = {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      "x-amazon-apigateway-authtype": "oauth2",
    };

    // When it is imported
    // Then it is refused, naming the three a REST API method is decided by
    await expect(importingScheme(simAws, scheme)).rejects.toThrow(
      /x-amazon-apigateway-authtype: is 'oauth2', and a REST API method is/,
    );
  });

  it("refuses a scheme whose authtype and authorizer disagree", async () => {
    // Given a custom scheme carrying a user pool authorizer, and a
    // cognito_user_pools scheme carrying a Lambda one
    const simAws = new SimAws();
    const cognitoUnderCustom: JSONObject = {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      "x-amazon-apigateway-authtype": "custom",
      "x-amazon-apigateway-authorizer": {
        type: "cognito_user_pools",
        providerARNs: [userPoolArn],
      },
    };
    const lambdaUnderCognito: JSONObject = {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      "x-amazon-apigateway-authtype": "cognito_user_pools",
      "x-amazon-apigateway-authorizer": { type: "token", authorizerUri },
    };

    // When each is imported
    // Then each is refused at the pointer of the type they disagree about,
    // rather than resolved either way
    await expect(importingScheme(simAws, cognitoUnderCustom)).rejects.toThrow(
      /securitySchemes\/pet-authorizer\/x-amazon-apigateway-authorizer\/type: is 'cognito_user_pools', and/,
    );
    await expect(importingScheme(simAws, lambdaUnderCognito)).rejects.toThrow(
      /x-amazon-apigateway-authorizer\/type: is 'token', and the security scheme/,
    );
  });

  it("refuses an awsSigv4 scheme carrying an authorizer", async () => {
    // Given a scheme declaring IAM authorization and an authorizer to invoke
    const simAws = new SimAws();
    const scheme: JSONObject = {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      "x-amazon-apigateway-authtype": "awsSigv4",
      "x-amazon-apigateway-authorizer": { type: "token", authorizerUri },
    };

    // When it is imported
    // Then it is refused, since an IAM method asks no authorizer anything
    await expect(importingScheme(simAws, scheme)).rejects.toThrow(
      /pet-authorizer\/x-amazon-apigateway-authorizer: declares an authorizer/,
    );
  });

  it("refuses an authorizer member it would not apply", async () => {
    // Given authorizers carrying each of them
    const simAws = new SimAws();
    const refused: readonly (readonly [string, JSONValue])[] = [
      ["authorizerCredentials", "arn:aws:iam::111111111111:role/Pets"],
      ["identityValidationExpression", "^Bearer .+"],
      ["providerARNs", [userPoolArn]],
      ["identitySource", "method.request.header.Authorization"],
    ];

    // When each is imported
    // Then each is refused naming the member, since a token authorizer here
    // applies none of it
    await Promise.all(
      refused.map(async ([member, value]) => {
        await expect(
          importingScheme(simAws, customScheme({ [member]: value })),
        ).rejects.toThrow(
          `#/components/securitySchemes/pet-authorizer/` +
            `x-amazon-apigateway-authorizer/${member}: `,
        );
      }),
    );
  });

  it("refuses a period held on an authorizer that verifies each token", async () => {
    // Given a user pool scheme asking for its decision to be held
    const simAws = new SimAws();
    const scheme: JSONObject = {
      type: "apiKey",
      name: "Authorization",
      in: "header",
      "x-amazon-apigateway-authtype": "cognito_user_pools",
      "x-amazon-apigateway-authorizer": {
        type: "cognito_user_pools",
        providerARNs: [userPoolArn],
        authorizerResultTtlInSeconds: 300,
      },
    };

    // When it is imported
    // Then CreateAuthorizer refuses it, under the pointer of the scheme the
    // period was written on
    await expect(importingScheme(simAws, scheme)).rejects.toThrow(
      /securitySchemes\/pet-authorizer: CreateAuthorizer authorizerResultTtlInSeconds is set on a COGNITO_USER_POOLS/,
    );
  });

  it("refuses a scheme naming a header no request carries one in", async () => {
    // Given a scheme whose token is read from the query string
    const simAws = new SimAws();
    const scheme = { ...customScheme({}), in: "query", name: "token" };

    // When it is imported
    // Then it is refused, since a token authorizer reads one request header
    await expect(importingScheme(simAws, scheme)).rejects.toThrow(
      /pet-authorizer\/in: is 'query', and the authorizer this scheme declares/,
    );
  });

  it("refuses a requirement naming a scheme the document does not define", async () => {
    // Given an operation naming a scheme nothing declares
    const simAws = new SimAws();

    // When it is imported
    // Then it is refused, naming where the schemes would have been
    await expect(
      importingOperation(simAws, { security: [{ "pet-authorizer": [] }] }),
    ).rejects.toThrow(
      /security\/0: names the security scheme 'pet-authorizer', which #\/components\/securitySchemes does not define/,
    );
  });

  it("refuses an operation saying twice who may call it", async () => {
    // Given operations naming two requirements, two schemes in one
    // requirement, and both a requirement and IAM authorization
    const simAws = new SimAws();

    // When each is imported
    // Then each is refused, since one method is decided by one authorizer
    await expect(
      importingOperation(simAws, {
        security: [{ "pet-authorizer": [] }, { "owner-authorizer": [] }],
      }),
    ).rejects.toThrow(/get\/security: carries 2 security requirements/);
    await expect(
      importingOperation(simAws, {
        security: [{ "pet-authorizer": [], "owner-authorizer": [] }],
      }),
    ).rejects.toThrow(/get\/security\/0: names 2 security schemes/);
    await expect(
      importingOperation(
        simAws,
        {
          security: [{ "pet-authorizer": [] }],
          "x-amazon-apigateway-auth": { type: "AWS_IAM" },
        },
        { securitySchemes: { "pet-authorizer": customScheme({}) } },
      ),
    ).rejects.toThrow(/get\/security\/0: names a security scheme, and the/);
  });

  it("refuses an x-amazon-apigateway-auth that is not IAM authorization", async () => {
    // Given an operation declaring some other authorization on the extension
    const simAws = new SimAws();

    // When it is imported
    // Then it is refused, since IAM authorization is all the extension
    // declares
    await expect(
      importingOperation(simAws, {
        "x-amazon-apigateway-auth": { type: "CUSTOM" },
      }),
    ).rejects.toThrow(
      /x-amazon-apigateway-auth\/type: is 'CUSTOM', and AWS_IAM is the one/,
    );
  });

  it("refuses scopes on a method that checks none", async () => {
    // Given an operation asking a Lambda authorizer's caller for a scope
    const simAws = new SimAws();

    // When it is imported
    // Then it is refused by PutMethod, under the pointer of the operation the
    // scopes were written on
    await expect(
      importingScheme(simAws, customScheme({}), ["pets.read"]),
    ).rejects.toThrow(
      /#\/paths\/~1pets\/get: PutMethod authorizationScopes is set on GET \/pets/,
    );
  });
});
