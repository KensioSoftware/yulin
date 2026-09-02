/**
 * The templates the SAM `Auth` refusal tests expand.
 *
 * They live under `test/` for the same reason the other helpers here do.
 * Oxlint rejects a test file that exports helpers alongside its own `describe`
 * calls, and `test/**` is type-checked with everything else, excluded from the
 * published build, not collected as a suite, and not counted in coverage.
 */

import { assertThrowsError } from "@kensio/smartass";

import { simCfnSamFunctionTemplateFactory } from "../../src/service/cloudformation/sam/function/sim-cfn-sam-function-template.factory.js";
import { samExpandedTemplate } from "../../src/service/cloudformation/sam/sim-cfn-sam-expansion.js";
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
