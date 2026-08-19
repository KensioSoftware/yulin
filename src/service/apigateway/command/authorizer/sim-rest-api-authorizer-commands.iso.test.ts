import {
  CreateAuthorizerCommand,
  CreateRestApiCommand,
  DeleteAuthorizerCommand,
  GetAuthorizerCommand,
  GetAuthorizersCommand,
} from "@aws-sdk/client-api-gateway";
import { assertIdentical, assertArrayLength } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayBadRequest,
  SimApiGatewayNotFound,
} from "../../error/sim-api-gateway.error.js";
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
 * The input a working TOKEN authorizer is created from.
 */
function tokenAuthorizerInput(restApiId: string): {
  readonly restApiId: string;
  readonly name: string;
  readonly type: "TOKEN";
  readonly authorizerUri: string;
  readonly identitySource: string;
} {
  return {
    restApiId,
    name: "session-check",
    type: "TOKEN",
    authorizerUri: authorizerFunctionArn,
    identitySource: "method.request.header.Authorization",
  };
}

describe("Sim API Gateway REST API authorizer commands", () => {
  it("creates a TOKEN authorizer on an API", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When a TOKEN authorizer is created on it
    const authorizer = await simAws
      .apiGateway()
      .createAuthorizer(
        new CreateAuthorizerCommand(tokenAuthorizerInput(restApiId)),
      );

    // Then it reports the id it was allocated and how it was configured
    expect(authorizer.id).toMatch(/^[a-z0-9]+$/u);
    assertIdentical(authorizer.name, "session-check");
    assertIdentical(authorizer.type, "TOKEN");
    assertIdentical(authorizer.authorizerUri, authorizerFunctionArn);
    assertIdentical(
      authorizer.identitySource,
      "method.request.header.Authorization",
    );
    // A TOKEN authorizer belongs to the custom family, which is what a Cognito
    // authorizer is told apart from.
    assertIdentical(authorizer.authType, "custom");
  });

  it("reads an authorizer back by id", async () => {
    // Given an API with an authorizer
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());
    const created = await simAws
      .apiGateway()
      .createAuthorizer(
        new CreateAuthorizerCommand(tokenAuthorizerInput(restApiId)),
      );

    // When it is read back
    const authorizer = await simAws
      .apiGateway()
      .getAuthorizer(
        new GetAuthorizerCommand({ restApiId, authorizerId: created.id }),
      );

    // Then it is the one that was created
    assertIdentical(authorizer.id, created.id);
    assertIdentical(authorizer.name, "session-check");
  });

  it("lists the authorizers of one API", async () => {
    // Given two APIs, each with an authorizer
    const simAws = new SimAws();
    const apiGateway = simAws.apiGateway();
    const restApiId = await givenRestApi(apiGateway);
    const otherRestApiId = await givenRestApi(apiGateway);
    await apiGateway.createAuthorizer(
      new CreateAuthorizerCommand(tokenAuthorizerInput(restApiId)),
    );
    await apiGateway.createAuthorizer(
      new CreateAuthorizerCommand({
        ...tokenAuthorizerInput(otherRestApiId),
        name: "other-check",
      }),
    );

    // When one API's authorizers are listed
    const listed = await apiGateway.getAuthorizers(
      new GetAuthorizersCommand({ restApiId }),
    );

    // Then only its own is there, because an authorizer belongs to an API
    assertArrayLength(listed.items, 1);
    assertIdentical(listed.items[0].name, "session-check");
  });

  it("deletes an authorizer", async () => {
    // Given an API with an authorizer
    const simAws = new SimAws();
    const apiGateway = simAws.apiGateway();
    const restApiId = await givenRestApi(apiGateway);
    const created = await apiGateway.createAuthorizer(
      new CreateAuthorizerCommand(tokenAuthorizerInput(restApiId)),
    );

    // When it is deleted
    await apiGateway.deleteAuthorizer(
      new DeleteAuthorizerCommand({ restApiId, authorizerId: created.id }),
    );

    // Then the API no longer has it
    const listed = await apiGateway.getAuthorizers(
      new GetAuthorizersCommand({ restApiId }),
    );
    assertArrayLength(listed.items, 0);
  });

  it("refuses to read an authorizer the API has not got", async () => {
    // Given an API with no authorizers
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When one is read by an id nothing answers to
    const authorizer = simAws
      .apiGateway()
      .getAuthorizer(
        new GetAuthorizerCommand({ restApiId, authorizerId: "nothere" }),
      );

    // Then it is a not found, as it is on real AWS
    await expect(authorizer).rejects.toThrow(SimApiGatewayNotFound);
  });

  it("refuses an authorizer kind nothing here invokes", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When a REQUEST authorizer is asked for
    const authorizer = simAws.apiGateway().createAuthorizer(
      new CreateAuthorizerCommand({
        ...tokenAuthorizerInput(restApiId),
        type: "REQUEST",
      }),
    );

    // Then it is refused, rather than created as something that decides
    // nothing
    await expect(authorizer).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(authorizer).rejects.toThrow(
      "CreateAuthorizer type 'REQUEST' is not simulated",
    );
  });

  it("refuses an identity source that is not a header", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When the authorizer takes its token from the query string
    const authorizer = simAws.apiGateway().createAuthorizer(
      new CreateAuthorizerCommand({
        ...tokenAuthorizerInput(restApiId),
        identitySource: "method.request.querystring.token",
      }),
    );

    // Then it is refused when it is configured, because an authorizer looking
    // somewhere nothing reads refuses every request for a reason that reads
    // like a signing problem
    await expect(authorizer).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(authorizer).rejects.toThrow(
      "a TOKEN authorizer reads one header",
    );
  });

  it("refuses an authorizer naming no function", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When an authorizer is created with no URI
    const authorizer = simAws.apiGateway().createAuthorizer(
      new CreateAuthorizerCommand({
        ...tokenAuthorizerInput(restApiId),
        authorizerUri: undefined,
      }),
    );

    // Then it is refused, since it would have nothing to ask
    await expect(authorizer).rejects.toThrow(
      "CreateAuthorizer with type TOKEN requires authorizerUri",
    );
  });

  it("refuses to hold a decision it was told to cache", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When an authorizer asks for its results to be held
    const authorizer = simAws.apiGateway().createAuthorizer(
      new CreateAuthorizerCommand({
        ...tokenAuthorizerInput(restApiId),
        authorizerResultTtlInSeconds: 300,
      }),
    );

    // Then it is refused, because an authorizer invoked once per request here
    // and once per five minutes on AWS is a difference a test would not see
    await expect(authorizer).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(authorizer).rejects.toThrow(
      "CreateAuthorizer authorizerResultTtlInSeconds is not simulated",
    );
  });
});
