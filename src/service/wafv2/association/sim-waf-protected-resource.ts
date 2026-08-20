import {
  SimWafInvalidParameterException,
  SimWafUnsimulatedInputException,
} from "../error/sim-wafv2.error.js";
import { SimWafRestApiStage } from "./sim-waf-rest-api-stage.js";

/**
 * A resource a `REGIONAL` web ACL can be put in front of.
 *
 * One type is simulated so far. A second one joins this union and the reader
 * below gains a branch for it, and everything that holds an association goes
 * on addressing a resource by its ARN.
 */
export type SimWafProtectedResource = SimWafRestApiStage;

/**
 * The type ListResourcesForWebACL lists a simulated resource under.
 */
export const simWafApiGatewayResourceType = "API_GATEWAY";

const restApiStagePattern =
  /^arn:aws:apigateway:(?<regionName>[^:]+)::\/restapis\/(?<restApiId>[^/]+)\/stages\/(?<stageName>[^/]+)$/u;

const httpApiStagePattern =
  /^arn:aws:apigateway:[^:]+::\/apis\/[^/]+\/stages\/[^/]+$/u;

/**
 * The resource types real WAF protects that this simulation does not, by the
 * service in their ARN.
 */
const unsimulatedResources = new Map<string, string>([
  ["elasticloadbalancing", "an Application Load Balancer"],
  ["appsync", "an AppSync GraphQL API"],
  ["cognito-idp", "a Cognito user pool"],
  ["apprunner", "an App Runner service"],
  ["amplify", "an Amplify app"],
  ["ec2", "a Verified Access instance"],
]);

/**
 * Read the resource an association names, refusing anything a web ACL cannot
 * be put in front of here.
 *
 * The three refusals mean different things. An HTTP API stage is refused
 * because AWS WAF protects no HTTP API, so an association accepted here would
 * let a test cover protection AWS never applies. A load balancer and the rest
 * are resource types AWS does protect and this simulation does not, which is
 * the ordinary unsimulated refusal. Anything else is not a resource ARN.
 */
export function simWafProtectedResource(arn: string): SimWafProtectedResource {
  const { groups } = restApiStagePattern.exec(arn) ?? {};

  if (groups !== undefined) {
    return new SimWafRestApiStage({
      arn,
      regionName: groups["regionName"] ?? "",
      restApiId: groups["restApiId"] ?? "",
      stageName: groups["stageName"] ?? "",
    });
  }

  if (httpApiStagePattern.test(arn)) {
    throw new SimWafInvalidParameterException(
      `AWS WAF does not protect an API Gateway HTTP API. The resource types ` +
        `it protects cover a REST API stage and not an HTTP API stage, so ` +
        `${arn} cannot be associated with a web ACL.`,
    );
  }

  refuseUnsimulatedResource(arn);

  throw new SimWafInvalidParameterException(
    `Error reason: The ARN isn't valid. A valid ARN begins with arn: and ` +
      `includes other information separated by colons or slashes., ` +
      `field: RESOURCE_ARN, parameter: ${arn}`,
  );
}

/**
 * Refuse an ARN naming a resource type AWS WAF protects and Yulin does not.
 */
function refuseUnsimulatedResource(arn: string): void {
  const described = unsimulatedResources.get(arn.split(":", 3)[2] ?? "");

  if (described !== undefined) {
    throw new SimWafUnsimulatedInputException(
      `AWS WAF protects ${described}, and Yulin does not simulate a web ACL ` +
        `in front of one, so ${arn} is refused rather than protected by ` +
        `nothing.`,
    );
  }
}
