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
async function refusalFor(scheme: JSONObject): Promise<string> {
  const body = JSON.stringify(
    simHttpApiOpenApiDocumentFactory.make({
      paths: {
        "/orders": {
          get: {
            security: [{ "pool-authorizer": [] }],
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
      ["apiKey", "http", "mutualTLS"].map(async (type) => refusalFor({ type })),
    );

    // Then each is refused, naming the scheme's own type member
    const named = refusals.filter((refusal) =>
      refusal.includes(`${schemePointer}/type`),
    );
    expect(named).toHaveLength(refusals.length);
  });

  it("refuses a Lambda authorizer declared in a security scheme", async () => {
    // Given and when each authorizer type that is not a JWT one is imported
    const refusals = await Promise.all(
      ["request", "token", "cognito_user_pools"].map(async (type) =>
        refusalFor(schemeCarrying({ type, identitySource: header })),
      ),
    );

    // Then each is refused, since nothing here runs the code that would decide
    const named = refusals.filter((refusal) =>
      refusal.includes(`${schemePointer}/x-amazon-apigateway-authorizer/type`),
    );
    expect(named).toHaveLength(refusals.length);
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
