import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  deployRestApi,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import { simCfnRestApiTemplateFactory } from "./sim-cfn-rest-api-template.factory.js";

/**
 * An authorizer function reading two of the things the request event carries,
 * which is what a `REQUEST` authorizer is for.
 */
const authorizerSource =
  "exports.handler = async (event) => ({" +
  "  principalId: event.headers['x-tenant']," +
  "  context: { plan: event.queryStringParameters.plan }," +
  "  policyDocument: { Version: '2012-10-17', Statement: [" +
  "    { Action: 'execute-api:Invoke', Effect: 'Allow'," +
  "      Resource: event.methodArn }] }," +
  "});";

/**
 * The authorizer's own function, the authorizer, and the grant API Gateway
 * needs to invoke it.
 *
 * The `SourceArn` names the authorizer rather than any method, which is what
 * CDK's `RequestAuthorizer` writes and what the API is asked about at request
 * time.
 */
const authorizerResources: SimCfnTemplateValueRecord = {
  AuthorizerFunction: {
    Type: "AWS::Lambda::Function",
    Properties: {
      FunctionName: "session-check",
      Role: { "Fn::GetAtt": ["HandlerRole", "Arn"] },
      Code: { ZipFile: authorizerSource },
      Handler: "index.handler",
      Runtime: "nodejs20.x",
    },
  },
  Authorizer: {
    Type: "AWS::ApiGateway::Authorizer",
    Properties: {
      RestApiId: { Ref: "Api" },
      Name: "session-check",
      Type: "REQUEST",
      IdentitySource:
        "method.request.header.X-Tenant,method.request.querystring.plan",
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
function gatedTemplate(): ReturnType<typeof simCfnRestApiTemplateFactory.make> {
  return simCfnRestApiTemplateFactory.make({
    handlerSource: authorizerContextHandler,
    methods: [{ httpMethod: "GET", path: ["orders"] }],
    methodProperties: {
      AuthorizationType: "CUSTOM",
      AuthorizerId: { Ref: "Authorizer" },
    },
    resources: authorizerResources,
  });
}

describe("Deploying a REST API REQUEST authorizer from CloudFormation", () => {
  it("gates a method with the authorizer the template declares", async () => {
    // Given a deployed API whose method names an AWS::ApiGateway::Authorizer
    // of type REQUEST
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(simAws, gatedTemplate());
    const restApi = stack.getResource("Api")?.simResource as
      | SimRestApi
      | undefined;
    assertNonNullable(restApi);
    const url = new SimAwsLocalUrl({
      input: `${restApi.invokeUrl("prod")}/orders`,
    }).toString();

    // When the method is requested carrying both identity sources, and then
    // missing the query string one
    const http = new SimAwsHttp({ simAws });
    const admitted = await http.fetch(`${url}?plan=gold`, {
      headers: { "x-tenant": "acme" },
    });
    const refused = await http.fetch(url, {
      headers: { "x-tenant": "acme" },
    });

    // Then the deployed authorizer decided both from the request it was shown
    assertResponseStatus(admitted, 200, await describeResponse(admitted));
    assertResponseStatus(refused, 401, await describeResponse(refused));
    expect(await admitted.json()).toStrictEqual({
      principalId: "acme",
      plan: "gold",
    });
  });

  it("reports the identity sources the template wrote", async () => {
    // Given a deployed API gated by a REQUEST authorizer
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(simAws, gatedTemplate());
    const restApi = stack.getResource("Api")?.simResource as
      | SimRestApi
      | undefined;
    assertNonNullable(restApi);

    // When the authorizer is read back
    const [authorizer] = restApi.authorizers.list();

    // Then the comma-separated string the template wrote is what it holds,
    // where an HTTP API would have taken a list
    assertNonNullable(authorizer);
    assertIdentical(authorizer.type, "REQUEST");
    assertIdentical(
      authorizer.view().identitySource,
      "method.request.header.X-Tenant,method.request.querystring.plan",
    );
  });
});
