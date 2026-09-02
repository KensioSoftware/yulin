import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deploySamAuthStack,
  samAuthApiLogicalId,
  samAuthAuthorizerFunction,
  samAuthHandlerSource,
  samAuthRequestAuthorizerSource,
  samAuthRestApiUrl,
  samAuthTokenAuthorizerSource,
} from "../../../../../../test/cloudformation/sam-api-auth.js";
import { SimAwsHttp } from "../../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../../serve/http/url/sim-aws-local-url.js";
import type { SimRestApi } from "../../../../apigateway/api/sim-rest-api.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { simCognitoSignedInFactory } from "../../../../cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import { simCfnSamFunctionTemplateFactory } from "../../function/sim-cfn-sam-function-template.factory.js";
import { samAuthorizerLogicalId } from "./sim-cfn-sam-api-auth.js";

describe("SAM REST API Auth expansion", () => {
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
        RestApiId: { Ref: samAuthApiLogicalId },
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
        InlineCode: samAuthHandlerSource,
        Events: properties.events,
      },
      resources: {
        [samAuthApiLogicalId]: {
          Type: "AWS::Serverless::Api",
          Properties: { StageName: "prod", Auth: properties.auth },
        },
        ...properties.resources,
      },
    });
  }

  /**
   * The Auth block of an API whose one authorizer is a Lambda function of the
   * template.
   */
  function lambdaAuth(
    authorizer: SimCfnTemplateValueRecord,
  ): SimCfnTemplateValueRecord {
    return {
      DefaultAuthorizer: "SessionCheck",
      Authorizers: {
        SessionCheck: {
          FunctionArn: { "Fn::GetAtt": ["SessionCheck", "Arn"] },
          ...authorizer,
        },
      },
    };
  }

  it("closes a method with the user pool the API's Auth names", async () => {
    // Given a SAM REST API whose Auth block declares a Cognito authorizer over
    // a pool that has a signed-in user, and applies it to every method
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deploySamAuthStack(
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
    const url = samAuthRestApiUrl(stack, "/orders");
    const refused = await http.fetch(url);
    const admitted = await http.fetch(url, {
      headers: { authorization: signedIn.accessToken },
    });

    // Then the expanded authorizer decides both, and the method never deploys
    // open
    assertResponseStatus(refused, 401, await describeResponse(refused));
    assertResponseStatus(admitted, 200, await describeResponse(admitted));
  });

  it("leaves a method open where its event names no authorizer", async () => {
    // Given the same DefaultAuthorizer, and a second event opening its own
    // method with Authorizer NONE
    const simAws = new SimAws();
    const signedIn = await simCognitoSignedInFactory.make({}, simAws);
    const stack = await deploySamAuthStack(
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
    const closed = await http.fetch(samAuthRestApiUrl(stack, "/orders"));
    const open = await http.fetch(samAuthRestApiUrl(stack, "/health"));

    // Then the default closed one of them and the event opened the other
    assertResponseStatus(closed, 401, await describeResponse(closed));
    assertResponseStatus(open, 200, await describeResponse(open));
  });

  it("runs the function a REQUEST authorizer names", async () => {
    // Given an API whose Auth declares a Lambda REQUEST authorizer over a
    // function of the same template, keyed on a header
    const simAws = new SimAws();
    const stack = await deploySamAuthStack(
      simAws,
      template({
        auth: lambdaAuth({
          FunctionPayloadType: "REQUEST",
          Identity: { Headers: ["X-Tenant"] },
        }),
        events: { Get: apiEvent("/orders") },
        resources: {
          SessionCheck: samAuthAuthorizerFunction(
            samAuthRequestAuthorizerSource,
          ),
        },
      }),
    );

    // When the method is requested with the header the authorizer admits, and
    // then with one it does not
    const http = new SimAwsHttp({ simAws });
    const url = samAuthRestApiUrl(stack, "/orders");
    const admitted = await http.fetch(url, {
      headers: { "x-tenant": "acme" },
    });
    const refused = await http.fetch(url, {
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
    const stack = await deploySamAuthStack(
      simAws,
      template({
        auth: lambdaAuth({ Identity: { Header: "X-Session" } }),
        events: { Get: apiEvent("/orders") },
        resources: {
          SessionCheck: samAuthAuthorizerFunction(samAuthTokenAuthorizerSource),
        },
      }),
    );

    // When the method is requested with the token the authorizer admits, and
    // then with another
    const http = new SimAwsHttp({ simAws });
    const url = samAuthRestApiUrl(stack, "/orders");
    const admitted = await http.fetch(url, {
      headers: { "x-session": "let-me-in" },
    });
    const refused = await http.fetch(url, {
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
    const stack = await deploySamAuthStack(
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
      samAuthRestApiUrl(stack, "/orders"),
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
    const stack = await deploySamAuthStack(
      simAws,
      simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          InlineCode: samAuthHandlerSource,
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

  it("conditions an API's authorizers the way the API is conditioned", async () => {
    // Given a SAM API carrying a Condition, with a Cognito authorizer on it
    const authorizerLogicalId = samAuthorizerLogicalId(
      { resourceType: "AWS::Serverless::Api", logicalId: samAuthApiLogicalId },
      "PoolAuth",
    );

    async function deployAt(
      stage: string,
    ): Promise<Awaited<ReturnType<typeof deploySamAuthStack>>> {
      const simAws = new SimAws();
      const signedIn = await simCognitoSignedInFactory.make({}, simAws);
      const body = simCfnSamFunctionTemplateFactory.make({
        functionProperties: { InlineCode: samAuthHandlerSource },
        resources: {
          [samAuthApiLogicalId]: {
            Type: "AWS::Serverless::Api",
            Condition: "IsProduction",
            Properties: {
              StageName: "prod",
              Auth: {
                DefaultAuthorizer: "PoolAuth",
                Authorizers: {
                  PoolAuth: { UserPoolArn: signedIn.userPoolArn },
                },
              },
            },
          },
        },
      });
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        parameters: { Stage: stage },
        template: {
          ...body,
          Parameters: { Stage: { Type: "String" } },
          Conditions: {
            IsProduction: { "Fn::Equals": [{ Ref: "Stage" }, "production"] },
          },
        },
      });
      await stack.waitForDeployComplete();

      return stack;
    }

    // When the stack is deployed with that condition true, and again with it
    // false
    const production = await deployAt("production");
    const test = await deployAt("test");

    // Then the authorizer is created with the API and left out with it, and
    // never left behind pointing at an API the stack did not create
    assertIdentical(
      production.getResource(authorizerLogicalId)?.type,
      "AWS::ApiGateway::Authorizer",
    );
    assertUndefined(test.getResource(authorizerLogicalId));
    assertUndefined(test.getResource(samAuthApiLogicalId));
  });

  it("fails the transform for an Auth property it cannot model", async () => {
    // Given an API closed with a resource policy, which nothing here simulates
    const simAws = new SimAws();

    // When the template is deployed
    const error = await assertThrowsErrorAsync(async () => {
      await deploySamAuthStack(
        simAws,
        template({
          auth: { ResourcePolicy: { IpRangeWhitelist: ["10.0.0.0/8"] } },
          events: { Get: apiEvent("/orders") },
        }),
      );
    });

    // Then the property is named, and the API never deploys open under an Auth
    // block that reads as closed
    assertStringIncludes(
      error.message,
      "Invalid Auth.ResourcePolicy on AWS::Serverless::Api Resource Orders",
    );
  });
});
