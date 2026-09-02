import {
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../../serve/http/url/sim-aws-local-url.js";
import type { SimHttpApi } from "../../../../apigatewayv2/api/sim-http-api.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCognitoSignedIn } from "../../../../cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import { simCognitoSignedInFactory } from "../../../../cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import type { SimCfnDeployedStack } from "../../../stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import { simCfnSamFunctionTemplateFactory } from "../../function/sim-cfn-sam-function-template.factory.js";

describe("SAM HTTP API Auth expansion", () => {
  /**
   * The logical ID the templates below give the API the events are routed to.
   */
  const apiLogicalId = "Orders";

  /**
   * A handler answering with the route that reached it, so a 200 says the
   * request got past the authorizer rather than that nothing was in its way.
   */
  const handlerSource = `
    exports.handler = async (event) => ({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: event.routeKey,
    });
  `;

  /**
   * The authorizer a template declares over the pool a test signed in against.
   */
  function jwtAuthorizer(
    signedIn: SimCognitoSignedIn,
  ): SimCfnTemplateValueRecord {
    return {
      JwtConfiguration: {
        issuer: signedIn.issuerUrl,
        audience: [signedIn.clientId],
      },
    };
  }

  /**
   * A Lambda authorizer answering in the simple format, admitting one tenant
   * and turning everybody else away.
   */
  const authorizerSource = `
    exports.handler = async (event) => ({
      isAuthorized: event.headers["x-tenant"] === "acme",
    });
  `;

  /**
   * One `HttpApi` event on the function, routing a path of the declared API.
   */
  function httpApiEvent(
    path: string,
    auth?: SimCfnTemplateValueRecord,
  ): SimCfnTemplateValueRecord {
    return {
      Type: "HttpApi",
      Properties: {
        ApiId: { Ref: apiLogicalId },
        Path: path,
        Method: "GET",
        ...(auth !== undefined && { Auth: auth }),
      },
    };
  }

  /**
   * A template whose function serves the given events through a declared
   * `AWS::Serverless::HttpApi`.
   */
  function template(properties: {
    readonly auth: SimCfnTemplateValueRecord;
    readonly events: SimCfnTemplateValueRecord;
  }): CfnTemplateBodyRecord {
    return simCfnSamFunctionTemplateFactory.make({
      functionProperties: {
        InlineCode: handlerSource,
        Events: properties.events,
      },
      resources: {
        [apiLogicalId]: {
          Type: "AWS::Serverless::HttpApi",
          Properties: { Auth: properties.auth },
        },
      },
    });
  }

  async function deploy(
    simAws: SimAws,
    body: CfnTemplateBodyRecord,
  ): Promise<SimCfnDeployedStack> {
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "orders-stack", template: body });
    await stack.waitForDeployComplete();

    return stack;
  }

  /**
   * The URL a path of a deployed API is served at.
   */
  function url(
    stack: SimCfnDeployedStack,
    logicalId: string,
    path: string,
  ): string {
    const api = stack.getResource(logicalId)?.simResource as SimHttpApi;
    assertNonNullable(api);

    return new SimAwsLocalUrl({
      input: `${api.apiEndpoint}${path}`,
    }).toString();
  }

  it("closes a route with the JWT authorizer the API's Auth names", async () => {
    // Given a SAM HTTP API whose Auth block declares a JWT authorizer trusting
    // the pool a user signed in against, and applies it to every route
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deploy(
      simAws,
      template({
        auth: {
          DefaultAuthorizer: "PoolAuth",
          Authorizers: { PoolAuth: jwtAuthorizer(signedIn) },
        },
        events: { Get: httpApiEvent("/orders") },
      }),
    );

    // When the route is requested without a token that pool issued, and then
    // with one
    const http = new SimAwsHttp({ simAws });
    const refused = await http.fetch(url(stack, apiLogicalId, "/orders"));
    const admitted = await http.fetch(url(stack, apiLogicalId, "/orders"), {
      headers: { authorization: `Bearer ${signedIn.accessToken}` },
    });

    // Then the expanded authorizer decides both, rather than the route
    // deploying open
    assertResponseStatus(refused, 401, await describeResponse(refused));
    assertResponseStatus(admitted, 200, await describeResponse(admitted));
  });

  it("leaves a route open where its event names no authorizer", async () => {
    // Given the same DefaultAuthorizer, and a second event opening its own
    // route with Authorizer NONE
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deploy(
      simAws,
      template({
        auth: {
          DefaultAuthorizer: "PoolAuth",
          Authorizers: { PoolAuth: jwtAuthorizer(signedIn) },
        },
        events: {
          Get: httpApiEvent("/orders"),
          Health: httpApiEvent("/health", { Authorizer: "NONE" }),
        },
      }),
    );

    // When both routes are requested without a token
    const http = new SimAwsHttp({ simAws });
    const closed = await http.fetch(url(stack, apiLogicalId, "/orders"));
    const open = await http.fetch(url(stack, apiLogicalId, "/health"));

    // Then the default closed one of them and the event opened the other
    assertResponseStatus(closed, 401, await describeResponse(closed));
    assertResponseStatus(open, 200, await describeResponse(open));
  });

  it("closes the implicit API with the Auth Globals.HttpApi states", async () => {
    // Given a template whose HttpApi event names no ApiId, with the JWT
    // authorizer stated once in Globals.HttpApi
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deploy(
      simAws,
      simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          InlineCode: handlerSource,
          Events: {
            Get: {
              Type: "HttpApi",
              Properties: { Path: "/orders", Method: "GET" },
            },
          },
        },
        httpApiGlobals: {
          Auth: {
            DefaultAuthorizer: "PoolAuth",
            Authorizers: { PoolAuth: jwtAuthorizer(signedIn) },
          },
        },
      }),
    );

    // When the implicit API's route is requested without a token
    const refused = await new SimAwsHttp({ simAws }).fetch(
      url(stack, "ServerlessHttpApi", "/orders"),
    );

    // Then the API the events made carries the authorizer too
    assertResponseStatus(refused, 401, await describeResponse(refused));
  });

  it("runs the function a REQUEST authorizer names", async () => {
    // Given an API whose Auth declares a Lambda authorizer over a function of
    // the same template, keyed on a header
    const simAws = new SimAws();
    const stack = await deploy(
      simAws,
      simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          InlineCode: handlerSource,
          Events: { Get: httpApiEvent("/orders") },
        },
        resources: {
          [apiLogicalId]: {
            Type: "AWS::Serverless::HttpApi",
            Properties: {
              Auth: {
                DefaultAuthorizer: "SessionCheck",
                Authorizers: {
                  SessionCheck: {
                    FunctionArn: { "Fn::GetAtt": ["SessionCheck", "Arn"] },
                    AuthorizerPayloadFormatVersion: "2.0",
                    EnableSimpleResponses: true,
                    Identity: { Headers: ["X-Tenant"] },
                  },
                },
              },
            },
          },
          SessionCheck: {
            Type: "AWS::Serverless::Function",
            Properties: {
              FunctionName: "session-check",
              Handler: "index.handler",
              Runtime: "nodejs22.x",
              InlineCode: authorizerSource,
            },
          },
        },
      }),
    );

    // When the route is requested with the header the authorizer admits, and
    // then with one it does not
    const http = new SimAwsHttp({ simAws });
    const admitted = await http.fetch(url(stack, apiLogicalId, "/orders"), {
      headers: { "x-tenant": "acme" },
    });
    const refused = await http.fetch(url(stack, apiLogicalId, "/orders"), {
      headers: { "x-tenant": "someone-else" },
    });

    // Then the deployed function decided both
    assertResponseStatus(admitted, 200, await describeResponse(admitted));
    assertResponseStatus(refused, 403, await describeResponse(refused));
  });

  it("closes a route with IAM where EnableIamAuthorizer asks for it", async () => {
    // Given an API whose Auth turns the IAM authorizer on and makes it the
    // default
    const simAws = new SimAws();
    const stack = await deploy(
      simAws,
      template({
        auth: { EnableIamAuthorizer: true, DefaultAuthorizer: "AWS_IAM" },
        events: { Get: httpApiEvent("/orders") },
      }),
    );

    // When the route is requested without a signature
    const refused = await new SimAwsHttp({ simAws }).fetch(
      url(stack, apiLogicalId, "/orders"),
    );

    // Then IAM turns it away, rather than the route deploying open
    assertResponseStatus(refused, 403, await describeResponse(refused));
  });

  it("leaves a route open where its API declares no Auth block", async () => {
    // Given an event routing to an API the template declares as an
    // ApiGatewayV2 Resource of its own, which has no SAM Auth block to read
    const simAws = new SimAws();
    const stack = await deploy(
      simAws,
      simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          InlineCode: handlerSource,
          Events: {
            Get: {
              Type: "HttpApi",
              Properties: {
                ApiId: apiLogicalId,
                Path: "/orders",
                Method: "GET",
              },
            },
          },
        },
        resources: {
          [apiLogicalId]: {
            Type: "AWS::ApiGatewayV2::Api",
            Properties: { Name: "orders", ProtocolType: "HTTP" },
          },
          Stage: {
            Type: "AWS::ApiGatewayV2::Stage",
            Properties: {
              ApiId: { Ref: apiLogicalId },
              StageName: "$default",
              AutoDeploy: true,
            },
          },
        },
      }),
    );

    // When the route is requested
    const served = await new SimAwsHttp({ simAws }).fetch(
      url(stack, apiLogicalId, "/orders"),
    );

    // Then it serves, the way a route on an API with no Auth block does
    assertResponseStatus(served, 200, await describeResponse(served));
  });

  it("fails the transform for an event naming an authorizer the API has not", async () => {
    // Given an event naming an authorizer the API's Auth block never declared
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);

    // When the template is deployed
    const error = await assertThrowsErrorAsync(async () => {
      await deploy(
        simAws,
        template({
          auth: { Authorizers: { PoolAuth: jwtAuthorizer(signedIn) } },
          events: { Get: httpApiEvent("/orders", { Authorizer: "StaffAuth" }) },
        }),
      );
    });

    // Then the event is named, rather than the route deploying open under a
    // name that reads as closed
    assertStringIncludes(
      error.message,
      "Invalid Events.Get.Auth.Authorizer on AWS::Serverless::Function " +
        "Resource Rates",
    );
    assertStringIncludes(error.message, "StaffAuth");
  });
});
