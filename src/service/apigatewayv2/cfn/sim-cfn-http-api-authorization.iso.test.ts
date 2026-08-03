import { assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployHttpApiFailure,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

describe("API Gateway v2 CloudFormation authorization validation", () => {
  it("refuses a route authorization type that is not one AWS has", async () => {
    // Given a route asking for something that is not an authorization type
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeProperties: { AuthorizationType: "LAMBDA" },
      }),
    );

    // Then CreateRoute refuses it rather than deploying an open route
    assertStringIncludes(
      error.message,
      "CreateRoute AuthorizationType 'LAMBDA' is not simulated",
    );
  });

  it("refuses a CUSTOM route naming no authorizer", async () => {
    // Given a route asking for a Lambda authorizer without saying which
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeProperties: { AuthorizationType: "CUSTOM" },
      }),
    );

    // Then the stack fails rather than deploying a route with nothing to send
    // its requests through
    assertStringIncludes(
      error.message,
      "CreateRoute with AuthorizationType CUSTOM requires AuthorizerId",
    );
  });

  it("refuses a JWT route naming an authorizer the template did not deploy", async () => {
    // Given a route asking for JWT authorization with an authorizer id that
    // is not one of this API's
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeProperties: { AuthorizationType: "JWT", AuthorizerId: "auth01" },
      }),
    );

    // Then the stack fails rather than deploying a route that is open here and
    // closed on AWS
    assertStringIncludes(
      error.message,
      "AuthorizerId auth01 names no authorizer",
    );
  });

  it("refuses an authorizer Resource declaring no JwtConfiguration", async () => {
    // Given a template carrying a JWT authorizer with no issuer stated
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        resources: {
          Authorizer: {
            Type: "AWS::ApiGatewayV2::Authorizer",
            Properties: {
              ApiId: { Ref: "Api" },
              AuthorizerType: "JWT",
              Name: "pool",
              IdentitySource: ["$request.header.Authorization"],
            },
          },
        },
      }),
    );

    // Then CreateAuthorizer refuses it with the reason it gives an SDK caller,
    // rather than the template deploying an authorizer trusting nothing
    assertStringIncludes(
      error.message,
      "CreateAuthorizer requires JwtConfiguration",
    );
  });

  it("refuses a Lambda authorizer declared as a Resource", async () => {
    // Given a template carrying a Lambda REQUEST authorizer
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        resources: {
          Authorizer: {
            Type: "AWS::ApiGatewayV2::Authorizer",
            Properties: {
              ApiId: { Ref: "Api" },
              AuthorizerType: "REQUEST",
              Name: "lambda",
              IdentitySource: ["$request.header.Authorization"],
            },
          },
        },
      }),
    );

    // Then the stack fails, saying where a REQUEST authorizer can be created
    // instead, rather than deploying one the template did not fully describe
    assertStringIncludes(
      error.message,
      "declares a Lambda REQUEST authorizer, which is not deployed from a " +
        "template yet",
    );
  });

  it("refuses an authorizer id on a route that authorizes nobody", async () => {
    // Given a route naming an authorizer while leaving its authorization type
    // at NONE
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeProperties: { AuthorizerId: "abc123" },
      }),
    );

    // Then CreateRoute refuses it, since the authorizer would be ignored here
    // and would leave the route open on AWS too
    assertStringIncludes(
      error.message,
      "CreateRoute AuthorizerId is set on a route with AuthorizationType NONE",
    );
  });
});
