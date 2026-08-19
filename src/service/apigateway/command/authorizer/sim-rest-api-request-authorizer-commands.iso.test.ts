import {
  CreateAuthorizerCommand,
  CreateRestApiCommand,
  GetAuthorizerCommand,
} from "@aws-sdk/client-api-gateway";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";

const authorizerFunctionArn =
  "arn:aws:lambda:us-east-1:111111111111:function:session-check";

/**
 * A REST API with nothing on it yet, which is all an authorizer needs.
 */
async function givenRestApi(apiGateway: SimApiGateway): Promise<string> {
  const created = await apiGateway.createRestApi(
    new CreateRestApiCommand({ name: "orders" }),
  );

  return created.id;
}

/**
 * The input a working REQUEST authorizer is created from.
 */
function requestAuthorizerInput(
  restApiId: string,
  identitySource = "method.request.header.Authorization",
): {
  readonly restApiId: string;
  readonly name: string;
  readonly type: "REQUEST";
  readonly authorizerUri: string;
  readonly identitySource: string;
} {
  return {
    restApiId,
    name: "session-check",
    type: "REQUEST",
    authorizerUri: authorizerFunctionArn,
    identitySource,
  };
}

describe("Sim API Gateway REST API REQUEST authorizer commands", () => {
  it("creates a REQUEST authorizer identified by several sources", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When an authorizer naming a header and a query string parameter is
    // created, written as one comma-separated string
    const authorizer = await simAws
      .apiGateway()
      .createAuthorizer(
        new CreateAuthorizerCommand(
          requestAuthorizerInput(
            restApiId,
            "method.request.header.X-Tenant,method.request.querystring.token",
          ),
        ),
      );

    // Then both are held, in the order they were written
    assertIdentical(authorizer.type, "REQUEST");
    assertIdentical(
      authorizer.identitySource,
      "method.request.header.X-Tenant,method.request.querystring.token",
    );
    // A REQUEST authorizer belongs to the same custom family a TOKEN one does
    assertIdentical(authorizer.authType, "custom");
  });

  it("reads a spaced out identity source list", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When the expressions are written with spaces around the separator
    const created = await simAws
      .apiGateway()
      .createAuthorizer(
        new CreateAuthorizerCommand(
          requestAuthorizerInput(
            restApiId,
            "method.request.header.X-Tenant, method.request.querystring.token",
          ),
        ),
      );

    // Then the authorizer reads back the expressions rather than the spacing
    const authorizer = await simAws
      .apiGateway()
      .getAuthorizer(
        new GetAuthorizerCommand({ restApiId, authorizerId: created.id }),
      );
    assertIdentical(
      authorizer.identitySource,
      "method.request.header.X-Tenant,method.request.querystring.token",
    );
  });

  it("refuses an identity source this simulation reads from nowhere", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When the authorizer identifies its caller by a path parameter
    const authorizer = simAws
      .apiGateway()
      .createAuthorizer(
        new CreateAuthorizerCommand(
          requestAuthorizerInput(restApiId, "method.request.path.tenantId"),
        ),
      );

    // Then it is refused when it is configured, because an authorizer looking
    // somewhere nothing reads refuses every request for a reason that reads
    // like a signing problem
    await expect(authorizer).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(authorizer).rejects.toThrow(
      "a REQUEST authorizer reads request headers and query string parameters",
    );
  });

  it("refuses one unreadable source among readable ones", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When one expression of the list names a stage variable
    const authorizer = simAws
      .apiGateway()
      .createAuthorizer(
        new CreateAuthorizerCommand(
          requestAuthorizerInput(
            restApiId,
            "method.request.header.X-Tenant,stageVariables.tenant",
          ),
        ),
      );

    // Then the whole authorizer is refused, since every source has to be
    // present before the function is invoked at all
    await expect(authorizer).rejects.toThrow(
      "identitySource 'stageVariables.tenant' is not simulated",
    );
  });

  it("refuses a query string identity source naming no parameter", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When the expression stops at its prefix
    const authorizer = simAws
      .apiGateway()
      .createAuthorizer(
        new CreateAuthorizerCommand(
          requestAuthorizerInput(restApiId, "method.request.querystring."),
        ),
      );

    // Then it is refused, since it would find nothing on every request
    await expect(authorizer).rejects.toThrow("names no query string parameter");
  });

  it("refuses an authorizer identified by nothing", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When an authorizer is created with no identity source
    const authorizer = simAws.apiGateway().createAuthorizer(
      new CreateAuthorizerCommand({
        ...requestAuthorizerInput(restApiId),
        identitySource: undefined,
      }),
    );

    // Then it is refused, as CreateAuthorizer on an HTTP API refuses one. Real
    // AWS invokes such an authorizer for every request including one carrying
    // nothing, and CDK's RequestAuthorizer requires at least one source.
    await expect(authorizer).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(authorizer).rejects.toThrow(
      "CreateAuthorizer with type REQUEST requires identitySource",
    );
  });

  it("refuses an identity source with a stray comma in it", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());
    const header = "method.request.header.X-Tenant";
    const strayComma = [
      `,${header}`,
      `${header},`,
      `${header},,${header}`,
      " , ",
    ];

    // When each list is written with a comma naming nothing
    const errors = await Promise.all(
      strayComma.map(async (identitySource) =>
        assertThrowsErrorAsync(async () => {
          await simAws
            .apiGateway()
            .createAuthorizer(
              new CreateAuthorizerCommand(
                requestAuthorizerInput(restApiId, identitySource),
              ),
            );
        }),
      ),
    );

    // Then each is refused rather than read as the shorter list it looks
    // like, since a dropped expression is one the request is never checked for
    for (const error of errors) {
      assertInstanceOf(error, SimApiGatewayBadRequest);
      assertStringIncludes(error.message, "holds an empty expression");
    }
  });

  it("refuses a REQUEST authorizer naming no function", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When an authorizer is created with no URI
    const authorizer = simAws.apiGateway().createAuthorizer(
      new CreateAuthorizerCommand({
        ...requestAuthorizerInput(restApiId),
        authorizerUri: undefined,
      }),
    );

    // Then it is refused, since it would have nothing to ask
    await expect(authorizer).rejects.toThrow(
      "CreateAuthorizer with type REQUEST requires authorizerUri",
    );
  });
});
