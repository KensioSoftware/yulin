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
import type { SimRestApi } from "../../../../apigateway/api/sim-rest-api.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { simCognitoSignedInFactory } from "../../../../cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import type { SimCfnDeployedStack } from "../../../stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import { simCfnSamFunctionTemplateFactory } from "../../function/sim-cfn-sam-function-template.factory.js";

describe("SAM REST API Auth expansion", () => {
  /**
   * The logical ID the templates below give the API the events are served by.
   */
  const apiLogicalId = "Orders";

  /**
   * A handler answering with the path that reached it, so a 200 says the
   * request got past the authorizer rather than that nothing was in its way.
   */
  const handlerSource = `
    exports.handler = async (event) => ({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: event.resource,
    });
  `;

  /**
   * A REQUEST authorizer reading a header off the request, admitting one
   * tenant and turning everybody else away.
   */
  const authorizerSource = `
    exports.handler = async (event) => ({
      principalId: event.headers["x-tenant"],
      policyDocument: { Version: "2012-10-17", Statement: [{
        Action: "execute-api:Invoke",
        Effect: event.headers["x-tenant"] === "acme" ? "Allow" : "Deny",
        Resource: event.methodArn,
      }] },
    });
  `;

  /**
   * A TOKEN authorizer, which is handed one header rather than the request,
   * admitting one token and turning everybody else away.
   */
  const tokenAuthorizerSource = `
    exports.handler = async (event) => ({
      principalId: "session",
      policyDocument: { Version: "2012-10-17", Statement: [{
        Action: "execute-api:Invoke",
        Effect: event.authorizationToken === "let-me-in" ? "Allow" : "Deny",
        Resource: event.methodArn,
      }] },
    });
  `;

  /**
   * One `Api` event on the function, serving a path of the declared API.
   */
  function apiEvent(
    path: string,
    auth?: SimCfnTemplateValueRecord,
  ): SimCfnTemplateValueRecord {
    return {
      Type: "Api",
      Properties: {
        RestApiId: { Ref: apiLogicalId },
        Path: path,
        Method: "GET",
        ...(auth !== undefined && { Auth: auth }),
      },
    };
  }

  /**
   * A template whose function serves the given events through a declared
   * `AWS::Serverless::Api`.
   */
  function template(properties: {
    readonly auth: SimCfnTemplateValueRecord;
    readonly events: SimCfnTemplateValueRecord;
    readonly resources?: SimCfnTemplateValueRecord;
  }): CfnTemplateBodyRecord {
    return simCfnSamFunctionTemplateFactory.make({
      functionProperties: {
        InlineCode: handlerSource,
        Events: properties.events,
      },
      resources: {
        [apiLogicalId]: {
          Type: "AWS::Serverless::Api",
          Properties: { StageName: "prod", Auth: properties.auth },
        },
        ...properties.resources,
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
   * The URL a path of the deployed API is served at.
   */
  function url(stack: SimCfnDeployedStack, path: string): string {
    const api = stack.getResource(apiLogicalId)?.simResource as SimRestApi;
    assertNonNullable(api);

    return new SimAwsLocalUrl({
      input: `${api.invokeUrl("prod")}${path}`,
    }).toString();
  }

  it("closes a method with the user pool the API's Auth names", async () => {
    // Given a SAM REST API whose Auth block declares a Cognito authorizer over
    // a pool that has a signed-in user, and applies it to every method
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deploy(
      simAws,
      template({
        auth: {
          DefaultAuthorizer: "PoolAuth",
          Authorizers: { PoolAuth: { UserPoolArn: signedIn.userPoolArn } },
        },
        events: { Get: apiEvent("/orders") },
      }),
    );

    // When the method is requested without a token that pool issued, and then
    // with one
    const http = new SimAwsHttp({ simAws });
    const refused = await http.fetch(url(stack, "/orders"));
    const admitted = await http.fetch(url(stack, "/orders"), {
      headers: { authorization: signedIn.accessToken },
    });

    // Then the expanded authorizer decides both, rather than the method
    // deploying open
    assertResponseStatus(refused, 401, await describeResponse(refused));
    assertResponseStatus(admitted, 200, await describeResponse(admitted));
  });

  it("leaves a method open where its event names no authorizer", async () => {
    // Given the same DefaultAuthorizer, and a second event opening its own
    // method with Authorizer NONE
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deploy(
      simAws,
      template({
        auth: {
          DefaultAuthorizer: "PoolAuth",
          Authorizers: { PoolAuth: { UserPoolArn: signedIn.userPoolArn } },
        },
        events: {
          Get: apiEvent("/orders"),
          Health: apiEvent("/health", { Authorizer: "NONE" }),
        },
      }),
    );

    // When both methods are requested without a token
    const http = new SimAwsHttp({ simAws });
    const closed = await http.fetch(url(stack, "/orders"));
    const open = await http.fetch(url(stack, "/health"));

    // Then the default closed one of them and the event opened the other
    assertResponseStatus(closed, 401, await describeResponse(closed));
    assertResponseStatus(open, 200, await describeResponse(open));
  });

  it("runs the function a REQUEST authorizer names", async () => {
    // Given an API whose Auth declares a Lambda REQUEST authorizer over a
    // function of the same template, keyed on a header
    const simAws = new SimAws();
    const stack = await deploy(
      simAws,
      template({
        auth: {
          DefaultAuthorizer: "SessionCheck",
          Authorizers: {
            SessionCheck: {
              FunctionArn: { "Fn::GetAtt": ["SessionCheck", "Arn"] },
              FunctionPayloadType: "REQUEST",
              Identity: { Headers: ["X-Tenant"] },
            },
          },
        },
        events: { Get: apiEvent("/orders") },
        resources: {
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

    // When the method is requested with the header the authorizer admits, and
    // then with one it does not
    const http = new SimAwsHttp({ simAws });
    const admitted = await http.fetch(url(stack, "/orders"), {
      headers: { "x-tenant": "acme" },
    });
    const refused = await http.fetch(url(stack, "/orders"), {
      headers: { "x-tenant": "someone-else" },
    });

    // Then the deployed function decided both
    assertResponseStatus(admitted, 200, await describeResponse(admitted));
    assertResponseStatus(refused, 403, await describeResponse(refused));
  });

  it("hands a TOKEN authorizer the header its Identity names", async () => {
    // Given an API whose Auth declares a Lambda authorizer of the kind SAM
    // defaults to, reading its token from a header of the template's choosing
    const simAws = new SimAws();
    const stack = await deploy(
      simAws,
      template({
        auth: {
          DefaultAuthorizer: "SessionCheck",
          Authorizers: {
            SessionCheck: {
              FunctionArn: { "Fn::GetAtt": ["SessionCheck", "Arn"] },
              Identity: { Header: "X-Session" },
            },
          },
        },
        events: { Get: apiEvent("/orders") },
        resources: {
          SessionCheck: {
            Type: "AWS::Serverless::Function",
            Properties: {
              FunctionName: "session-check",
              Handler: "index.handler",
              Runtime: "nodejs22.x",
              InlineCode: tokenAuthorizerSource,
            },
          },
        },
      }),
    );

    // When the method is requested with the token the authorizer admits, and
    // then with another
    const http = new SimAwsHttp({ simAws });
    const admitted = await http.fetch(url(stack, "/orders"), {
      headers: { "x-session": "let-me-in" },
    });
    const refused = await http.fetch(url(stack, "/orders"), {
      headers: { "x-session": "someone-else" },
    });

    // Then the header the Identity named is the one the token arrived in
    assertResponseStatus(admitted, 200, await describeResponse(admitted));
    assertResponseStatus(refused, 403, await describeResponse(refused));
  });

  it("asks the token for the scopes the authorizer names", async () => {
    // Given a Cognito authorizer asking for a scope no simulated sign-in
    // issues
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deploy(
      simAws,
      template({
        auth: {
          DefaultAuthorizer: "PoolAuth",
          Authorizers: {
            PoolAuth: {
              UserPoolArn: signedIn.userPoolArn,
              AuthorizationScopes: ["orders.write"],
            },
          },
        },
        events: { Get: apiEvent("/orders") },
      }),
    );

    // When the method is requested with a token that pool issued
    const refused = await new SimAwsHttp({ simAws }).fetch(
      url(stack, "/orders"),
      { headers: { authorization: signedIn.accessToken } },
    );

    // Then the scopes reached the method, and the token that meets none of
    // them is turned away
    assertResponseStatus(refused, 403, await describeResponse(refused));
  });

  it("closes the implicit API with the Auth Globals.Api states", async () => {
    // Given a template whose Api event names no RestApiId, with the pool
    // authorizer stated once in Globals.Api
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deploy(
      simAws,
      simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          InlineCode: handlerSource,
          Events: {
            Get: {
              Type: "Api",
              Properties: { Path: "/orders", Method: "GET" },
            },
          },
        },
        apiGlobals: {
          Auth: {
            DefaultAuthorizer: "PoolAuth",
            Authorizers: { PoolAuth: { UserPoolArn: signedIn.userPoolArn } },
          },
        },
      }),
    );

    // When the implicit API's method is requested without a token
    const api = stack.getResource("ServerlessRestApi")
      ?.simResource as SimRestApi;
    assertNonNullable(api);
    const refused = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({
        input: `${api.invokeUrl("Prod")}/orders`,
      }).toString(),
    );

    // Then the API the events made carries the authorizer too
    assertResponseStatus(refused, 401, await describeResponse(refused));
  });

  it("fails the transform for an Auth property it cannot model", async () => {
    // Given an API closed with a resource policy, which nothing here simulates
    const simAws = new SimAws();

    // When the template is deployed
    const error = await assertThrowsErrorAsync(async () => {
      await deploy(
        simAws,
        template({
          auth: { ResourcePolicy: { IpRangeWhitelist: ["10.0.0.0/8"] } },
          events: { Get: apiEvent("/orders") },
        }),
      );
    });

    // Then the property is named, rather than the API deploying open under an
    // Auth block that reads as closed
    assertStringIncludes(
      error.message,
      "Invalid Auth.ResourcePolicy on AWS::Serverless::Api Resource Orders",
    );
  });
});
