import {
  assertIdentical,
  assertObjectMatches,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployHttpApi,
  deployHttpApiFailure,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

/**
 * The authorizer function, which admits one cookie and passes a tenant on.
 */
const authorizerSource =
  "exports.handler = async (event) => ({ isAuthorized: " +
  "event.identitySource[0] === 'session=valid', context: { tenant: 'acme' } });";

/**
 * The integration handler, reporting what the authorizer passed on to it.
 */
const handlerSource =
  "exports.handler = async (event) => ({ statusCode: 200, body: " +
  "event.requestContext.authorizer.lambda.tenant });";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

/**
 * The Resources a template needs to protect a route with a Lambda authorizer:
 * a function of its own, the grant API Gateway invokes it under, the
 * authorizer, and the route pointing at it by `Ref`.
 *
 * The authorizer's `SourceArn` names the authorizer rather than a route, which
 * is the ARN CDK writes and the one API Gateway invokes it under.
 */
function requestAuthorizerTemplate(
  authorizerProperties: SimCfnTemplateValueRecord = {},
): ReturnType<typeof simCfnHttpApiTemplateFactory.make> {
  return simCfnHttpApiTemplateFactory.make({
    routeKeys: ["GET /account"],
    handlerSource,
    routeProperties: {
      AuthorizationType: "CUSTOM",
      AuthorizerId: { Ref: "Authorizer" },
    },
    resources: {
      AuthorizerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "session-authorizer-role",
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
        },
      },
      AuthorizerFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "session-authorizer",
          Role: { "Fn::GetAtt": ["AuthorizerRole", "Arn"] },
          Code: { ZipFile: authorizerSource },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
        },
      },
      Authorizer: {
        Type: "AWS::ApiGatewayV2::Authorizer",
        Properties: {
          ApiId: { Ref: "Api" },
          Name: "session-cookie",
          AuthorizerType: "REQUEST",
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
          AuthorizerPayloadFormatVersion: "2.0",
          EnableSimpleResponses: true,
          IdentitySource: ["$request.header.cookie"],
          AuthorizerResultTtlInSeconds: 300,
          ...authorizerProperties,
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
                { "Fn::GetAtt": ["Authorizer", "AuthorizerId"] },
              ],
            ],
          },
        },
      },
    },
    outputs: {
      ApiId: { Value: { "Fn::GetAtt": ["Api", "ApiId"] } },
      AuthorizerId: { Value: { "Fn::GetAtt": ["Authorizer", "AuthorizerId"] } },
    },
  });
}

function get(
  simAws: SimAws,
  stack: SimCfnDeployedStack,
  cookie: string,
): Promise<Response> {
  const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value as string;

  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${apiEndpoint}/account` }).toString(),
    { headers: { cookie } },
  );
}

describe("Deploying an AWS::ApiGatewayV2::Authorizer of type REQUEST", () => {
  it("protects a CUSTOM route with the function the template deploys", async () => {
    // Given a template whose route goes through a Lambda authorizer deployed
    // by the same stack
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(simAws, requestAuthorizerTemplate());

    // When the deployed route is called with a cookie the authorizer refuses,
    // and then with one it accepts
    const refused = await get(simAws, stack, "session=expired");
    const admitted = await get(simAws, stack, "session=valid");

    // Then the deployed authorizer decided both, and the context it returned
    // reached the handler
    assertIdentical(refused.status, 403);
    assertIdentical(admitted.status, 200);
    assertIdentical(await admitted.text(), "acme");
  });

  it("deploys the authorizer with the properties the Resource declared", async () => {
    // Given the same stack
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(simAws, requestAuthorizerTemplate());

    // When the API is read back
    const apiId = stack.outputs.get("ApiId")?.value as string;
    const authorizers = await simAws
      .apiGatewayV2()
      .getAuthorizers({ input: { ApiId: apiId } });
    const routes = await simAws
      .apiGatewayV2()
      .getRoutes({ input: { ApiId: apiId } });

    // Then the authorizer carries what the template gave it, including the
    // wrapped AuthorizerUri as the template wrote it, and the route is the one
    // pointed at it
    assertObjectMatches(authorizers.Items[0] ?? {}, {
      Name: "session-cookie",
      AuthorizerType: "REQUEST",
      AuthorizerUri:
        "arn:aws:apigateway:eu-west-2:lambda:path/2015-03-31/functions/" +
        "arn:aws:lambda:eu-west-2:888888888888:function:session-authorizer" +
        "/invocations",
      AuthorizerPayloadFormatVersion: "2.0",
      EnableSimpleResponses: true,
      AuthorizerResultTtlInSeconds: 300,
      IdentitySource: ["$request.header.cookie"],
    });
    assertObjectMatches(routes.Items[0] ?? {}, {
      AuthorizationType: "CUSTOM",
      AuthorizerId: stack.outputs.get("AuthorizerId")?.value,
    });
  });

  it("reads a cache period written as a string, as CloudFormation does", async () => {
    // Given a template whose TTL is the string form CloudFormation carries a
    // number in
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      requestAuthorizerTemplate({ AuthorizerResultTtlInSeconds: "300" }),
    );

    // When the API is read back
    const apiId = stack.outputs.get("ApiId")?.value as string;
    const authorizers = await simAws
      .apiGatewayV2()
      .getAuthorizers({ input: { ApiId: apiId } });

    // Then it deployed as the number it holds
    assertIdentical(authorizers.Items[0]?.AuthorizerResultTtlInSeconds, 300);
  });

  it("refuses a cache period that is not a number", async () => {
    // Given templates whose TTL is a word, and one where it is not even a
    // string
    const refused = "AuthorizerResultTtlInSeconds must be a number";

    // When each is deployed
    const word = await deployHttpApiFailure(
      simAwsInEuWest2(),
      requestAuthorizerTemplate({ AuthorizerResultTtlInSeconds: "soon" }),
    );
    const boolean = await deployHttpApiFailure(
      simAwsInEuWest2(),
      requestAuthorizerTemplate({ AuthorizerResultTtlInSeconds: true }),
    );

    // Then each stack fails saying what the property has to be
    assertStringIncludes(word.message, refused);
    assertStringIncludes(boolean.message, refused);
  });

  it("refuses the route when the authorizer's own grant is missing", async () => {
    // Given the same template with the authorizer's invoke permission removed
    const simAws = simAwsInEuWest2();
    const template = requestAuthorizerTemplate();
    const resources = template.Resources as Record<string, unknown>;
    delete resources["AuthorizerPermission"];
    const stack = await deployHttpApi(simAws, template);

    // When the route is called with a cookie the authorizer would accept
    const response = await get(simAws, stack, "session=valid");

    // Then API Gateway could not invoke it, as on AWS: the integration's own
    // grant names the route rather than the authorizer
    assertIdentical(response.status, 500);
  });
});
