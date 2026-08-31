import {
  assertIdentical,
  assertNonNullable,
  assertObjectMatches,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsError,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployHttpApi,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { simCognitoSignedInFactory } from "../../cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

/**
 * The Resources a template needs to protect its routes with a user pool: the
 * authorizer itself, and the route pointing at it by `Ref`.
 */
function authorizerResources(
  issuer: string,
  clientId: string,
): ReturnType<typeof simCfnHttpApiTemplateFactory.make> {
  return simCfnHttpApiTemplateFactory.make({
    routeKeys: ["GET /orders"],
    handlerSource:
      "exports.handler = async (event) => ({ statusCode: 200, body: " +
      "event.requestContext.authorizer.jwt.claims.token_use });",
    routeProperties: {
      AuthorizationType: "JWT",
      AuthorizerId: { Ref: "Authorizer" },
    },
    resources: {
      Authorizer: {
        Type: "AWS::ApiGatewayV2::Authorizer",
        Properties: {
          ApiId: { Ref: "Api" },
          Name: "pool-authorizer",
          AuthorizerType: "JWT",
          IdentitySource: ["$request.header.Authorization"],
          JwtConfiguration: { Issuer: issuer, Audience: [clientId] },
        },
      },
    },
    outputs: {
      ApiId: { Value: { "Fn::GetAtt": ["Api", "ApiId"] } },
      AuthorizerId: { Value: { "Fn::GetAtt": ["Authorizer", "AuthorizerId"] } },
      AuthorizerRef: { Value: { Ref: "Authorizer" } },
    },
  });
}

describe("Deploying an AWS::ApiGatewayV2::Authorizer", () => {
  it("protects a route with a user pool the template names as its issuer", async () => {
    // Given a simulated Cognito pool with a signed-in user, and a template
    // whose route is protected by an authorizer trusting that pool
    const simAws = simAwsInEuWest2();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deployHttpApi(
      simAws,
      authorizerResources(signedIn.issuerUrl, signedIn.clientId),
    );

    // When the deployed route is called without a token, and then with one
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value as string;
    const url = new SimAwsLocalUrl({
      input: `${apiEndpoint}/orders`,
    }).toString();
    const http = new SimAwsHttp({ simAws });
    const refused = await http.fetch(url);
    const admitted = await http.fetch(url, {
      headers: { authorization: `Bearer ${signedIn.accessToken}` },
    });

    // Then the deployed route is closed to anyone without a token, and the
    // handler saw the claims of the one that was accepted
    assertResponseStatus(refused, 401, await describeResponse(refused));
    assertResponseStatus(admitted, 200, await describeResponse(admitted));
    assertIdentical(await admitted.text(), "access");
  });

  it("publishes the authorizer id through Ref and Fn::GetAtt", async () => {
    // Given the same stack
    const simAws = simAwsInEuWest2();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deployHttpApi(
      simAws,
      authorizerResources(signedIn.issuerUrl, signedIn.clientId),
    );

    // Then the route deployed holding the id the authorizer was allocated,
    // which is what both Ref and Fn::GetAtt AuthorizerId answer with
    const authorizerId = stack.outputs.get("AuthorizerId")?.value;
    const routes = await simAws.apiGatewayV2().getRoutes({
      input: { ApiId: stack.outputs.get("ApiId")?.value as string },
    });
    assertIdentical(stack.outputs.get("AuthorizerRef")?.value, authorizerId);
    assertObjectMatches(routes.Items[0] ?? {}, {
      AuthorizationType: "JWT",
      AuthorizerId: authorizerId,
    });
  });

  it("publishes no other attribute", async () => {
    // Given the same stack
    const simAws = simAwsInEuWest2();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deployHttpApi(
      simAws,
      authorizerResources(signedIn.issuerUrl, signedIn.clientId),
    );

    // When an attribute the Resource type does not publish is asked for
    // Then it says so, rather than answering with nothing
    const authorizer = stack.getResource("Authorizer");
    assertNonNullable(authorizer);
    assertStringIncludes(
      assertThrowsError(() => authorizer.attributeValue("Name")).message,
      "Unsupported AWS::ApiGatewayV2::Authorizer attribute Name",
    );
  });
});
