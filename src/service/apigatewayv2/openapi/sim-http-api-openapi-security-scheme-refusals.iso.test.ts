import { ImportApiCommand } from "@aws-sdk/client-apigatewayv2";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import type { JSONObject } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simHttpApiOpenApiDocumentFactory } from "./sim-http-api-openapi-document.factory.js";
import { simHttpApiOpenApiIntegrationFactory } from "./sim-http-api-openapi-integration.factory.js";

const issuer = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_orders";

const header = "$request.header.Authorization";

const schemePointer = "#/components/securitySchemes/pool-authorizer";

/**
 * The message an import refuses a security scheme with.
 *
 * Every case here is one scheme and one refusal, and the document around it is
 * the same each time, so it is built here rather than restated.
 */
async function refusalFor(
  scheme: JSONObject,
  scopes: string[] = [],
): Promise<string> {
  const body = JSON.stringify(
    simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          get: {
            security: [{ "pool-authorizer": scopes }],
            "x-amazon-apigateway-integration":
              simHttpApiOpenApiIntegrationFactory.make(),
          },
        },
      },
      components: { securitySchemes: { "pool-authorizer": scheme } },
    }),
  );
  const [outcome] = await Promise.allSettled([
    new SimAws().apiGatewayV2().importApi(new ImportApiCommand({ Body: body })),
  ]);
  assertNonNullable(outcome);
  assertIdentical(outcome.status, "rejected");

  return String(outcome.reason);
}

/**
 * An oauth2 scheme carrying whatever authorizer extension is under test.
 */
function schemeCarrying(authorizer: JSONObject): JSONObject {
  return { type: "oauth2", "x-amazon-apigateway-authorizer": authorizer };
}

/**
 * An apiKey scheme carrying a Lambda `REQUEST` authorizer, with whatever the
 * case under test adds to or overrides on it.
 */
function requestSchemeCarrying(authorizer: JSONObject): JSONObject {
  return {
    type: "apiKey",
    name: "cookie",
    in: "header",
    "x-amazon-apigateway-authorizer": {
      type: "request",
      identitySource: "$request.header.cookie",
      authorizerUri:
        "arn:aws:lambda:us-east-1:111111111111:function:session-authorizer",
      authorizerPayloadFormatVersion: "2.0",
      ...authorizer,
    },
  };
}

describe("What a sim HTTP API import refuses in a security scheme", () => {
  it("refuses an OpenID Connect scheme, which would need a fetch", async () => {
    // Given and when a scheme naming its discovery document is imported
    const refusal = await refusalFor({
      type: "openIdConnect",
      openIdConnectUrl: `${issuer}/.well-known/openid-configuration`,
    });

    // Then it is refused rather than taking the URL as the issuer, which would
    // mismatch every token's `iss` and answer a silent 401
    expect(refusal).toContain("AWS reads the issuer out of the discovery");
  });

  it("refuses the security scheme types an HTTP API route cannot use", async () => {
    // Given and when schemes of each other type are imported
    const refusals = await Promise.all(
      ["http", "mutualTLS"].map(async (type) => refusalFor({ type })),
    );

    // Then each is refused, naming the scheme's own type member
    const named = refusals.filter((refusal) =>
      refusal.includes(`${schemePointer}/type`),
    );
    expect(named).toHaveLength(refusals.length);
  });

  it("refuses an authorizer of a kind its security scheme does not declare", async () => {
    // Given and when authorizer types an HTTP API has no route for, under the
    // oauth2 scheme AWS declares a JWT one with
    const refusals = await Promise.all(
      ["request", "token", "cognito_user_pools"].map(async (type) =>
        refusalFor(schemeCarrying({ type, identitySource: header })),
      ),
    );

    // Then each is refused, since the scheme and its extension disagree about
    // which kind of authorizer the document declared
    const named = refusals.filter((refusal) =>
      refusal.includes(`${schemePointer}/x-amazon-apigateway-authorizer/type`),
    );
    expect(named).toHaveLength(refusals.length);
  });

  it("refuses a JWT authorizer under the apiKey scheme a Lambda one uses", async () => {
    // Given and when a jwt authorizer declared under an apiKey scheme
    const refusal = await refusalFor({
      type: "apiKey",
      name: "Authorization",
      in: "header",
      "x-amazon-apigateway-authorizer": { type: "jwt", identitySource: header },
    });

    // Then it is refused, naming the kind the scheme itself declares
    expect(refusal).toContain(
      "is 'jwt', and the security scheme carrying it declares a 'request' " +
        "authorizer",
    );
  });

  it("refuses a scheme carrying no authorizer extension", async () => {
    // Given and when an oauth2 scheme with nothing API Gateway reads
    const refusal = await refusalFor({ type: "oauth2", flows: {} });

    // Then it is refused, naming the extension the scheme has to carry
    expect(refusal).toContain(
      `${schemePointer}/x-amazon-apigateway-authorizer: is required`,
    );
  });

  it("refuses more than one identity source", async () => {
    // Given and when an authorizer looking in two places for the token
    const refusal = await refusalFor(
      schemeCarrying({
        type: "jwt",
        identitySource: `${header}, $request.querystring.access_token`,
        jwtConfiguration: { issuer, audience: ["orders-client"] },
      }),
    );

    // Then it is refused rather than reading only the first
    expect(refusal).toContain("identitySource: carries 2 identity sources");
  });

  it("refuses an authorizer with no JWT configuration", async () => {
    // Given and when a JWT authorizer that names no issuer at all
    const refusal = await refusalFor(
      schemeCarrying({ type: "jwt", identitySource: header }),
    );

    // Then it is refused, since an authorizer with no issuer would trust
    // nothing and refuse every request
    expect(refusal).toContain(
      "x-amazon-apigateway-authorizer/jwtConfiguration: is required",
    );
  });

  it("refuses a request authorizer asking for payload format 1.0", async () => {
    // Given and when a Lambda authorizer written for the payload format AWS
    // defaults to
    const refusal = await refusalFor(
      requestSchemeCarrying({ authorizerPayloadFormatVersion: "1.0" }),
    );

    // Then it is refused, naming the requirement's own pointer, since a 1.0
    // authorizer receives an event nothing here builds
    expect(refusal).toContain("#/paths/~1orders/get/security/0");
    expect(refusal).toContain(
      "CreateAuthorizer AuthorizerPayloadFormatVersion '1.0' is not simulated",
    );
  });

  it("refuses a request authorizer naming a Role for API Gateway to assume", async () => {
    // Given and when an authorizer with credentials of its own
    const refusal = await refusalFor(
      requestSchemeCarrying({
        authorizerCredentials: "arn:aws:iam::111111111111:role/Authorizer",
      }),
    );

    // Then it is refused, since the function's resource policy is the whole
    // decision here
    expect(refusal).toContain(
      "authorizerCredentials: names an IAM Role for API Gateway to assume",
    );
  });

  it("refuses a request authorizer member written in the wrong shape", async () => {
    // Given and when a boolean written as a word and a number written as a
    // string, neither of which JSON needed
    const [enableSimpleResponses, resultTtl] = await Promise.all([
      refusalFor(requestSchemeCarrying({ enableSimpleResponses: "yes" })),
      refusalFor(
        requestSchemeCarrying({ authorizerResultTtlInSeconds: "300" }),
      ),
    ]);

    // Then each is refused, naming the member and the shape it has to be
    expect(enableSimpleResponses).toContain(
      "enableSimpleResponses: has to be a boolean",
    );
    expect(resultTtl).toContain(
      "authorizerResultTtlInSeconds: has to be a number",
    );
  });

  it("refuses scopes on a route a Lambda authorizer decides", async () => {
    // Given and when a requirement asking a request authorizer for scopes
    const refusal = await refusalFor(requestSchemeCarrying({}), [
      "orders.read",
    ]);

    // Then CreateRoute refuses them, as AWS applies route scopes to a JWT
    // route only
    expect(refusal).toContain(
      "CreateRoute AuthorizationScopes is set on a route with " +
        "AuthorizationType CUSTOM",
    );
  });

  it("refuses a JWT configuration with no issuer, as CreateAuthorizer does", async () => {
    // Given and when a configuration naming only its audience
    const refusal = await refusalFor(
      schemeCarrying({
        type: "jwt",
        identitySource: header,
        jwtConfiguration: { audience: ["orders-client"] },
      }),
    );

    // Then the refusal an SDK caller gets arrives under the pointer of the
    // requirement that produced it
    expect(refusal).toContain("CreateAuthorizer requires JwtConfiguration");
  });
});
