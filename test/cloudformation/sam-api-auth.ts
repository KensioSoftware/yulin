/**
 * What the SAM `Auth` expansion tests deploy and read back.
 *
 * They live under `test/` for the same reason the other helpers here do.
 * Oxlint rejects a test file that exports helpers alongside its own `describe`
 * calls, and `test/**` is type-checked with everything else, excluded from the
 * published build, not collected as a suite, and not counted in coverage.
 */

import { assertNonNullable, assertThrowsError } from "@kensio/smartass";

import { SimAwsLocalUrl } from "../../src/serve/http/url/sim-aws-local-url.js";
import type { SimRestApi } from "../../src/service/apigateway/api/sim-rest-api.js";
import type { SimHttpApi } from "../../src/service/apigatewayv2/api/sim-http-api.js";
import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { simCfnSamFunctionTemplateFactory } from "../../src/service/cloudformation/sam/function/sim-cfn-sam-function-template.factory.js";
import { samExpandedTemplate } from "../../src/service/cloudformation/sam/sim-cfn-sam-expansion.js";
import type { SimCfnDeployedStack } from "../../src/service/cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../src/service/cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../src/service/cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The logical ID the templates give the API the event is served by.
 */
export const samAuthApiLogicalId = "Orders";

/**
 * Why the SAM transform refused a template whose API states the given `Auth`.
 *
 * The function serves one path of that API, under an `Api` or an `HttpApi`
 * event according to the kind of API asked for.
 */
export function samAuthRefusal(
  kind: "Api" | "HttpApi",
  auth: SimCfnTemplateValue,
  eventAuth?: SimCfnTemplateValue,
): string {
  const rest = kind === "Api";
  const body = simCfnSamFunctionTemplateFactory.make({
    functionProperties: {
      Events: {
        Get: {
          Type: kind,
          Properties: {
            Path: "/orders",
            Method: "GET",
            [rest ? "RestApiId" : "ApiId"]: { Ref: samAuthApiLogicalId },
            ...(eventAuth !== undefined && { Auth: eventAuth }),
          },
        },
      },
    },
    resources: {
      [samAuthApiLogicalId]: {
        Type: rest ? "AWS::Serverless::Api" : "AWS::Serverless::HttpApi",
        Properties: { StageName: "prod", Auth: auth },
      },
    },
  });

  return assertThrowsError(() => samExpandedTemplate(body)).message;
}

/**
 * Why the SAM transform refused an `HttpApi` event that states the given
 * `Auth` against an API named by an intrinsic nothing here reads.
 *
 * An event naming its API that way reaches no `Auth` block, so an authorizer
 * it names cannot be resolved to a Resource.
 */
export function samUnreadableApiRefusal(
  eventAuth: SimCfnTemplateValue,
): string {
  const body = simCfnSamFunctionTemplateFactory.make({
    functionProperties: {
      Events: {
        Get: {
          Type: "HttpApi",
          Properties: {
            ApiId: { "Fn::ImportValue": "orders-api-id" },
            Path: "/orders",
            Method: "GET",
            Auth: eventAuth,
          },
        },
      },
    },
  });

  return assertThrowsError(() => samExpandedTemplate(body)).message;
}

/**
 * A Lambda authorizer with the given block added to it, for the cases about
 * what an authorizer states beside its function.
 */
export function samLambdaAuthorizer(
  added: Record<string, SimCfnTemplateValue>,
): SimCfnTemplateValue {
  return {
    Authorizers: { SessionCheck: { FunctionArn: "arn:check", ...added } },
  };
}

/**
 * A handler answering with the path that reached it. A 200 says the request
 * got past the authorizer, and not that nothing was in its way.
 */
export const samAuthHandlerSource = `
  exports.handler = async (event) => ({
    statusCode: 200,
    headers: { "content-type": "text/plain" },
    body: event.resource ?? event.routeKey,
  });
`;

/**
 * A REST API `REQUEST` authorizer reading a header off the request, admitting
 * one tenant and turning everybody else away.
 */
export const samAuthRequestAuthorizerSource = `
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
 * A REST API `TOKEN` authorizer, which is handed one header and not the
 * request, admitting one token and turning everybody else away.
 */
export const samAuthTokenAuthorizerSource = `
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
 * An HTTP API Lambda authorizer answering in the simple format, admitting one
 * tenant and turning everybody else away.
 */
export const samAuthSimpleAuthorizerSource = `
  exports.handler = async (event) => ({
    isAuthorized: event.headers["x-tenant"] === "acme",
  });
`;

/**
 * The SAM function a template declares to run one of the authorizers above.
 */
export function samAuthAuthorizerFunction(source: string): SimCfnTemplateValue {
  return {
    Type: "AWS::Serverless::Function",
    Properties: {
      FunctionName: "session-check",
      Handler: "index.handler",
      Runtime: "nodejs22.x",
      InlineCode: source,
    },
  };
}

/**
 * Deploy one of these templates and wait for what it declares to be serving.
 */
export async function deploySamAuthStack(
  simAws: SimAws,
  template: CfnTemplateBodyRecord,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName: "orders-stack", template });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * The URL a path of the deployed REST API is served at.
 */
export function samAuthRestApiUrl(
  stack: SimCfnDeployedStack,
  path: string,
): string {
  const api = stack.getResource(samAuthApiLogicalId)?.simResource as SimRestApi;
  assertNonNullable(api);

  return new SimAwsLocalUrl({
    input: `${api.invokeUrl("prod")}${path}`,
  }).toString();
}

/**
 * The URL a path of a deployed HTTP API is served at.
 */
export function samAuthHttpApiUrl(
  stack: SimCfnDeployedStack,
  logicalId: string,
  path: string,
): string {
  const api = stack.getResource(logicalId)?.simResource as SimHttpApi;
  assertNonNullable(api);

  return new SimAwsLocalUrl({ input: `${api.apiEndpoint}${path}` }).toString();
}
