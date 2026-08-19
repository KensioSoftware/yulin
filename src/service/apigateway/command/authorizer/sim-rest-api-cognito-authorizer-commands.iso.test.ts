import {
  CreateAuthorizerCommand,
  CreateResourceCommand,
  CreateRestApiCommand,
  GetAuthorizerCommand,
  GetMethodCommand,
  PutMethodCommand,
} from "@aws-sdk/client-api-gateway";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";

const userPoolArn =
  "arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_aBcDeFgHi";

const secondUserPoolArn =
  "arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_jKlMnOpQr";

interface GatedApi {
  readonly restApiId: string;
  readonly resourceId: string;
  readonly authorizerId: string;
}

/**
 * The input a working COGNITO_USER_POOLS authorizer is created from.
 */
function cognitoAuthorizerInput(restApiId: string): {
  readonly restApiId: string;
  readonly name: string;
  readonly type: "COGNITO_USER_POOLS";
  readonly providerARNs: string[];
  readonly identitySource: string;
} {
  return {
    restApiId,
    name: "user-pools",
    type: "COGNITO_USER_POOLS",
    providerARNs: [userPoolArn],
    identitySource: "method.request.header.Authorization",
  };
}

/**
 * An API with a resource and a Cognito authorizer, ready for a method that
 * names it.
 */
async function givenGatedApi(apiGateway: SimApiGateway): Promise<GatedApi> {
  const created = await apiGateway.createRestApi(
    new CreateRestApiCommand({ name: "orders" }),
  );
  const resource = await apiGateway.createResource(
    new CreateResourceCommand({
      restApiId: created.id,
      parentId: created.rootResourceId,
      pathPart: "orders",
    }),
  );
  const authorizer = await apiGateway.createAuthorizer(
    new CreateAuthorizerCommand(cognitoAuthorizerInput(created.id)),
  );

  return {
    restApiId: created.id,
    resourceId: resource.id,
    authorizerId: authorizer.id,
  };
}

describe("Sim API Gateway REST API Cognito authorizer commands", () => {
  it("creates a COGNITO_USER_POOLS authorizer on an API", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));

    // When an authorizer naming two user pools is created on it
    const authorizer = await simAws.apiGateway().createAuthorizer(
      new CreateAuthorizerCommand({
        ...cognitoAuthorizerInput(created.id),
        providerARNs: [userPoolArn, secondUserPoolArn],
      }),
    );

    // Then it reports the pools it was given and the family it belongs to,
    // which is what tells it apart from a Lambda authorizer
    expect(authorizer.id).toMatch(/^[a-z0-9]+$/u);
    assertIdentical(authorizer.type, "COGNITO_USER_POOLS");
    assertIdentical(authorizer.authType, "cognito_user_pools");
    expect(authorizer.providerARNs).toStrictEqual([
      userPoolArn,
      secondUserPoolArn,
    ]);
    assertIdentical(
      authorizer.identitySource,
      "method.request.header.Authorization",
    );
  });

  it("reads a Cognito authorizer back by id", async () => {
    // Given an API with a Cognito authorizer
    const simAws = new SimAws();
    const { restApiId, authorizerId } = await givenGatedApi(
      simAws.apiGateway(),
    );

    // When it is read back
    const authorizer = await simAws
      .apiGateway()
      .getAuthorizer(new GetAuthorizerCommand({ restApiId, authorizerId }));

    // Then it reports the pools it verifies against and no function, since it
    // invokes nothing
    expect(authorizer.providerARNs).toStrictEqual([userPoolArn]);
    assertUndefined(authorizer.authorizerUri);
  });

  it("gates a method with the authorizer and the scopes it asks for", async () => {
    // Given an API with a resource and a Cognito authorizer
    const simAws = new SimAws();
    const { restApiId, resourceId, authorizerId } = await givenGatedApi(
      simAws.apiGateway(),
    );

    // When a method names it and asks the token for a scope
    await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "COGNITO_USER_POOLS",
        authorizerId,
        authorizationScopes: ["orders.read"],
      }),
    );
    const method = await simAws
      .apiGateway()
      .getMethod(
        new GetMethodCommand({ restApiId, resourceId, httpMethod: "GET" }),
      );

    // Then the method reports both, as real GetMethod does
    assertIdentical(method.authorizationType, "COGNITO_USER_POOLS");
    assertIdentical(method.authorizerId, authorizerId);
    expect(method.authorizationScopes).toStrictEqual(["orders.read"]);
  });

  it("refuses an authorizer naming no user pool", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));

    // When a Cognito authorizer is created with no providerARNs
    const authorizer = simAws.apiGateway().createAuthorizer(
      new CreateAuthorizerCommand({
        ...cognitoAuthorizerInput(created.id),
        providerARNs: undefined,
      }),
    );

    // Then it is refused, since it would have nothing to verify against and
    // would refuse every request
    await expect(authorizer).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(authorizer).rejects.toThrow(
      "CreateAuthorizer with type COGNITO_USER_POOLS requires providerARNs",
    );
  });

  it("refuses a providerARN that names no user pool", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));

    // When the ARN names something else
    const authorizer = simAws.apiGateway().createAuthorizer(
      new CreateAuthorizerCommand({
        ...cognitoAuthorizerInput(created.id),
        providerARNs: ["arn:aws:sns:eu-west-2:111111111111:orders"],
      }),
    );

    // Then it is refused where it was written, rather than at request time
    await expect(authorizer).rejects.toThrow("is not a user pool ARN");
  });

  it("refuses a Cognito authorizer naming a function", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));

    // When the authorizer carries an authorizerUri as well as its pools
    const authorizer = simAws.apiGateway().createAuthorizer(
      new CreateAuthorizerCommand({
        ...cognitoAuthorizerInput(created.id),
        authorizerUri:
          "arn:aws:lambda:eu-west-2:111111111111:function:session-check",
      }),
    );

    // Then it is refused, because nothing would ever invoke that function
    await expect(authorizer).rejects.toThrow(
      "authorizerUri is set on a COGNITO_USER_POOLS authorizer",
    );
  });

  it("refuses a method naming an authorizer of the other kind", async () => {
    // Given an API whose authorizer verifies user pool tokens
    const simAws = new SimAws();
    const { restApiId, resourceId, authorizerId } = await givenGatedApi(
      simAws.apiGateway(),
    );

    // When a CUSTOM method names it
    const method = simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "CUSTOM",
        authorizerId,
      }),
    );

    // Then it is refused, since the two never stand in for each other
    await expect(method).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(method).rejects.toThrow(
      "names a COGNITO_USER_POOLS authorizer, which does not serve " +
        "authorizationType CUSTOM",
    );
  });

  it("refuses scopes on a method that checks none", async () => {
    // Given an API with a resource
    const simAws = new SimAws();
    const { restApiId, resourceId } = await givenGatedApi(simAws.apiGateway());

    // When an open method carries scopes
    const method = simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId,
        httpMethod: "GET",
        authorizationType: "NONE",
        authorizationScopes: ["orders.read"],
      }),
    );

    // Then it is refused, because a method carrying scopes nothing checks
    // reads as gated by them and is not
    await expect(method).rejects.toThrow(
      "PutMethod authorizationScopes is set on GET /orders",
    );
  });
});
