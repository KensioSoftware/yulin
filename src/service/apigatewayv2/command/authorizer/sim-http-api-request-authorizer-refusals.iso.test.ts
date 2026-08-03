import {
  CreateApiCommand,
  CreateAuthorizerCommand,
  type CreateAuthorizerCommandInput,
} from "@aws-sdk/client-apigatewayv2";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

const functionArn = "arn:aws:lambda:eu-west-2:111111111111:function:session";
const issuer = "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_abc123";

async function createdApiId(simAws: SimAws): Promise<string> {
  const created = await simAws
    .apiGatewayV2()
    .createApi(new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }));

  return created.ApiId;
}

/**
 * A REQUEST authorizer input with one member changed, so each test says only
 * what it is about.
 */
function requestAuthorizer(
  apiId: string,
  changed: Partial<CreateAuthorizerCommandInput>,
): CreateAuthorizerCommand {
  return new CreateAuthorizerCommand({
    ApiId: apiId,
    Name: "session-cookie",
    AuthorizerType: "REQUEST",
    AuthorizerUri: functionArn,
    AuthorizerPayloadFormatVersion: "2.0",
    IdentitySource: ["$request.header.cookie"],
    ...changed,
  });
}

describe("What a Lambda REQUEST authorizer refuses rather than ignores", () => {
  it("refuses payload format 1.0, and an unstated format", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an authorizer asks for the older payload format, and when it says
    // nothing, which is the same thing on AWS
    // Then both are refused by name, since a 1.0 authorizer receives a
    // different event and answers against a different ARN
    await expect(
      simAws
        .apiGatewayV2()
        .createAuthorizer(
          requestAuthorizer(apiId, { AuthorizerPayloadFormatVersion: "1.0" }),
        ),
    ).rejects.toThrow(/AuthorizerPayloadFormatVersion '1.0' is not simulated/);

    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "unstated",
          AuthorizerType: "REQUEST",
          AuthorizerUri: functionArn,
          IdentitySource: ["$request.header.cookie"],
        }),
      ),
    ).rejects.toThrow(/AWS defaults it to '1.0'/);
  });

  it("refuses a result cache AWS would refuse the length of", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an authorizer asks to hold a decision for longer than AWS does,
    // and when it asks for a negative period
    // Then each is refused, rather than held for a period no deployed
    // authorizer could be configured with
    await expect(
      simAws
        .apiGatewayV2()
        .createAuthorizer(
          requestAuthorizer(apiId, { AuthorizerResultTtlInSeconds: 7200 }),
        ),
    ).rejects.toThrow(/holds an authorizer's decision for between 0 and 3600/);

    await expect(
      simAws
        .apiGatewayV2()
        .createAuthorizer(
          requestAuthorizer(apiId, { AuthorizerResultTtlInSeconds: -1 }),
        ),
    ).rejects.toThrow(/holds an authorizer's decision for between 0 and 3600/);

    // And when it asks for the longest AWS allows, that is accepted
    const created = await simAws
      .apiGatewayV2()
      .createAuthorizer(
        requestAuthorizer(apiId, { AuthorizerResultTtlInSeconds: 3600 }),
      );
    assertIdentical(created.AuthorizerResultTtlInSeconds, 3600);
  });

  it("refuses a result cache it could not key", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an authorizer asks to cache a decision without naming anything to
    // identify the caller by
    // Then it is refused naming the cache, since AWS keys it on the identity
    // source values and has nothing to key it on either
    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        requestAuthorizer(apiId, {
          IdentitySource: [],
          AuthorizerResultTtlInSeconds: 300,
        }),
      ),
    ).rejects.toThrow(/AWS has nothing to key it on/);
  });

  it("refuses the Role API Gateway would assume to invoke the function", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an authorizer names credentials to invoke its function with
    // Then it is refused, since the function's own resource policy is what
    // decides here and the Role would apply on AWS
    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        new CreateAuthorizerCommand({
          ApiId: apiId,
          Name: "credentialed",
          AuthorizerType: "REQUEST",
          AuthorizerUri: functionArn,
          AuthorizerPayloadFormatVersion: "2.0",
          IdentitySource: ["$request.header.cookie"],
          AuthorizerCredentialsArn: "arn:aws:iam::111111111111:role/Invoker",
        }),
      ),
    ).rejects.toThrow(/AuthorizerCredentialsArn is not simulated/);
  });

  it("requires a function, and one it could invoke", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an authorizer names no function, then a qualified one
    // Then each is refused rather than created with nothing to ask
    await expect(
      simAws
        .apiGatewayV2()
        .createAuthorizer(requestAuthorizer(apiId, { AuthorizerUri: "" })),
    ).rejects.toThrow(/AuthorizerType REQUEST requires AuthorizerUri/);

    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        requestAuthorizer(apiId, {
          AuthorizerUri: `${functionArn}:live`,
        }),
      ),
    ).rejects.toThrow(/AuthorizerUri .+ is not a simulated invocation target/);
  });

  it("requires an identity source, and one it would read", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When an authorizer names none, then one naming neither a header nor a
    // query string parameter
    // Then each is refused: an authorizer with no source runs for every
    // request on AWS, and a `$context` source is read from nowhere here
    await expect(
      simAws
        .apiGatewayV2()
        .createAuthorizer(requestAuthorizer(apiId, { IdentitySource: [] })),
    ).rejects.toThrow(/CreateAuthorizer requires IdentitySource/);

    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        requestAuthorizer(apiId, {
          IdentitySource: ["$context.identity.sourceIp"],
        }),
      ),
    ).rejects.toThrow(/IdentitySource '\$context.identity.sourceIp'/);
  });

  it("refuses a JwtConfiguration on a REQUEST authorizer", async () => {
    // Given an API
    const simAws = new SimAws();
    const apiId = await createdApiId(simAws);

    // When a REQUEST authorizer also states an issuer
    // Then it is refused, since its function decides and nothing here would
    // verify a token against that issuer
    await expect(
      simAws.apiGatewayV2().createAuthorizer(
        requestAuthorizer(apiId, {
          JwtConfiguration: { Issuer: issuer, Audience: ["client-1"] },
        }),
      ),
    ).rejects.toThrow(/JwtConfiguration is set on a REQUEST authorizer/);
  });
});
