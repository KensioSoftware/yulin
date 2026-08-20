import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  deployRestApi,
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApiLambdaAuthorizer } from "../api/authorizer/sim-rest-api-lambda-authorizer.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import { simCfnRestApiTemplateFactory } from "./sim-cfn-rest-api-template.factory.js";

/**
 * The authorizer's own function, and the grant API Gateway needs to invoke it.
 *
 * The `SourceArn` names the authorizer rather than any method, which is what
 * CDK's `TokenAuthorizer` writes and what the API is asked about at request
 * time.
 */
const authorizerResources: SimCfnTemplateValueRecord = {
  AuthorizerFunction: {
    Type: "AWS::Lambda::Function",
    Properties: {
      FunctionName: "session-check",
      Role: { "Fn::GetAtt": ["HandlerRole", "Arn"] },
      Code: {
        ZipFile:
          "exports.handler = async (event) => ({" +
          "  principalId: 'user-6'," +
          "  context: { tenantId: 'acme' }," +
          "  policyDocument: { Version: '2012-10-17', Statement: [" +
          "    { Action: 'execute-api:Invoke', Effect: 'Allow'," +
          "      Resource: event.methodArn }] }," +
          "});",
      },
      Handler: "index.handler",
      Runtime: "nodejs20.x",
    },
  },
  Authorizer: {
    Type: "AWS::ApiGateway::Authorizer",
    Properties: {
      RestApiId: { Ref: "Api" },
      Name: "session-check",
      Type: "TOKEN",
      IdentitySource: "method.request.header.Authorization",
      AuthorizerUri: {
        "Fn::Join": [
          "",
          [
            "arn:aws:apigateway:",
            { Ref: "AWS::Region" },
            ":lambda:path/2015-03-31/functions/",
            { "Fn::GetAtt": ["AuthorizerFunction", "Arn"] },
            "/invocations",
          ],
        ],
      },
    },
  },
  AuthorizerPermission: {
    Type: "AWS::Lambda::Permission",
    Properties: {
      Action: "lambda:InvokeFunction",
      FunctionName: { "Fn::GetAtt": ["AuthorizerFunction", "Arn"] },
      Principal: "apigateway.amazonaws.com",
      SourceArn: {
        "Fn::Join": [
          "",
          [
            "arn:aws:execute-api:",
            { Ref: "AWS::Region" },
            ":",
            { Ref: "AWS::AccountId" },
            ":",
            { Ref: "Api" },
            "/authorizers/",
            { Ref: "Authorizer" },
          ],
        ],
      },
    },
  },
};

/**
 * A handler reporting what the authorizer passed on to it.
 */
const authorizerContextHandler = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(event.requestContext.authorizer),
});
`;

/**
 * The template that deploys a REST API gated by that authorizer.
 */
function gatedTemplate(
  authorizerProperties: SimCfnTemplateValueRecord = {},
): ReturnType<typeof simCfnRestApiTemplateFactory.make> {
  const authorizer = authorizerResources["Authorizer"] as {
    Type: string;
    Properties: SimCfnTemplateValueRecord;
  };

  return simCfnRestApiTemplateFactory.make({
    handlerSource: authorizerContextHandler,
    methods: [{ httpMethod: "GET", path: ["orders"] }],
    methodProperties: {
      AuthorizationType: "CUSTOM",
      AuthorizerId: { Ref: "Authorizer" },
    },
    resources: {
      ...authorizerResources,
      Authorizer: {
        ...authorizer,
        Properties: { ...authorizer.Properties, ...authorizerProperties },
      },
    },
  });
}

describe("Deploying a REST API authorizer from CloudFormation", () => {
  it("gates a method with the authorizer the template declares", async () => {
    // Given a deployed API whose method names an AWS::ApiGateway::Authorizer
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(simAws, gatedTemplate());
    const restApi = stack.resources.get("Api")?.simResource as
      | SimRestApi
      | undefined;
    assertNonNullable(restApi);
    const url = new SimAwsLocalUrl({
      input: `${restApi.invokeUrl("prod")}/orders`,
    }).toString();

    // When the method is requested with and without a token
    const http = new SimAwsHttp({ simAws });
    const admitted = await http.fetch(url, {
      headers: { authorization: "Bearer session-6" },
    });
    const refused = await http.fetch(url);

    // Then the deployed authorizer decides both, rather than the method
    // answering everything, and what it passed on reaches the handler
    assertIdentical(admitted.status, 200);
    assertIdentical(refused.status, 401);
    expect(await admitted.json()).toStrictEqual({
      principalId: "user-6",
      tenantId: "acme",
    });
  });

  it("answers a Ref on the authorizer with its id", async () => {
    // Given a deployed API gated by an authorizer
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(simAws, gatedTemplate());
    const restApi = stack.resources.get("Api")?.simResource as
      | SimRestApi
      | undefined;
    assertNonNullable(restApi);

    // When the method that names it by Ref is read back
    const [authorizer] = restApi.authorizers.list();
    const method = restApi.resources
      .list()
      .flatMap((resource) => resource.listMethods())
      .find((one) => one.httpMethod === "GET");

    // Then the Ref resolved to the id the API allocated, which is what a
    // method names an authorizer by
    assertNonNullable(authorizer);
    assertIdentical(method?.authorizerId, authorizer.authorizerId);
  });

  it("deploys the period the authorizer holds a decision for", async () => {
    // Given an authorizer asking for its decisions to be held, written as the
    // string CloudFormation carries a template number as
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployRestApi(
      simAws,
      gatedTemplate({ AuthorizerResultTtlInSeconds: "300" }),
    );
    const restApi = stack.resources.get("Api")?.simResource as
      | SimRestApi
      | undefined;
    assertNonNullable(restApi);

    // Then the authorizer holds its decisions for that many seconds
    const [authorizer] = restApi.authorizers.list();
    assertNonNullable(authorizer);
    assertIdentical(
      (authorizer as SimRestApiLambdaAuthorizer).resultTtlSeconds,
      300,
    );
  });

  it("records a property outside the simulated set", async () => {
    // Given an authorizer asking for a validation expression
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployRestApi(
      simAws,
      gatedTemplate({ IdentityValidationExpression: "^Bearer .+$" }),
    );

    // Then the API deploys and the record says which of its parts behaves
    // differently to the template
    assertIdentical(
      stack.resources.get("Authorizer")?.status,
      "CREATE_COMPLETE",
    );
    assertStringIncludes(
      ignoredReasons(stack).join("\n"),
      "AWS::ApiGateway::Authorizer property IdentityValidationExpression is " +
        "not simulated",
    );
  });

  it("deletes the authorizer with the rest of the stack", async () => {
    // Given a deployed API gated by an authorizer
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(simAws, gatedTemplate());
    const restApi = stack.resources.get("Api")?.simResource as
      | SimRestApi
      | undefined;
    assertNonNullable(restApi);

    // When the Stack's Resources are torn down
    await stack.teardown();

    // Then the authorizer went through DeleteAuthorizer, and the API is gone
    assertIdentical(
      stack.resources.get("Authorizer")?.status,
      "DELETE_COMPLETE",
    );
    assertUndefined(simAws.apiGateway().findRestApi(restApi.apiId));
  });

  it("refuses a method naming an authorizer the API has not got", async () => {
    // Given a method gated by an id nothing answers to
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const deploy = deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        methodProperties: {
          AuthorizationType: "CUSTOM",
          AuthorizerId: "nothere",
        },
      }),
    );

    // Then PutMethod refuses it, since the method would refuse every request
    // for a reason a caller reads as a signing problem
    await expect(deploy).rejects.toThrow("names no authorizer of REST API");
  });
});
