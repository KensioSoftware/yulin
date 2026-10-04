import {
  SimWafInvalidParameterException,
  SimWafUnsimulatedInputException,
} from "../error/sim-wafv2.error.js";
import { SimWafRestApiStage } from "./sim-waf-rest-api-stage.js";
import {
  SimWafUnsimulatedResource,
  simWafUnsimulatedResourceTypes,
} from "./sim-waf-unsimulated-resource.js";
import { SimWafUserPool } from "./sim-waf-user-pool.js";

/**
 * A resource a `REGIONAL` web ACL can be put in front of.
 *
 * Requests reach a web ACL through two types here. The rest are held as
 * `SimWafUnsimulatedResource`, associated and listed, with nothing evaluated
 * in front of them. A type that starts serving requests gets a class of its
 * own in this union, and everything that holds an association goes on
 * addressing a resource by its ARN.
 */
export type SimWafProtectedResource =
  | SimWafRestApiStage
  | SimWafUserPool
  | SimWafUnsimulatedResource;

/**
 * The type ListResourcesForWebACL lists one simulated resource under.
 */
export type SimWafProtectedResourceType =
  SimWafProtectedResource["resourceType"];

/**
 * The type ListResourcesForWebACL lists a simulated REST API stage under.
 */
export const simWafApiGatewayResourceType = "API_GATEWAY";

/**
 * The type ListResourcesForWebACL lists a simulated user pool under.
 */
export const simWafUserPoolResourceType = "COGNITO_USER_POOL";

/**
 * The resource types ListResourcesForWebACL lists, which are all the types
 * an association can hold.
 */
export const simWafProtectedResourceTypes: readonly SimWafProtectedResourceType[] =
  [
    simWafApiGatewayResourceType,
    simWafUserPoolResourceType,
    ...simWafUnsimulatedResourceTypes,
  ];

const restApiStagePattern =
  /^arn:aws:apigateway:(?<regionName>[^:]+)::\/restapis\/(?<restApiId>[^/]+)\/stages\/(?<stageName>[^/]+)$/u;

const httpApiStagePattern =
  /^arn:aws:apigateway:[^:]+::\/apis\/[^/]+\/stages\/[^/]+$/u;

const userPoolPattern =
  /^arn:aws:cognito-idp:(?<regionName>[^:]+):(?<accountId>[^:]+):userpool\/(?<userPoolId>[^/]+)$/u;

const amplifyAppPattern = /^arn:aws:amplify:[^:]+:[^:]+:apps\/[^/]+$/u;

/**
 * Read the resource an association names, refusing anything a web ACL cannot
 * be put in front of.
 *
 * The three refusals mean different things. An HTTP API stage is refused
 * because AWS WAF protects no HTTP API, so an association accepted here would
 * let a test cover protection AWS never applies. An Amplify app takes a
 * `CLOUDFRONT` web ACL from `us-east-1` for an app in any Region, and a WAFv2
 * here reaches web ACLs in its own Region only. Anything else is not a
 * resource ARN.
 */
export function simWafProtectedResource(arn: string): SimWafProtectedResource {
  const stage = restApiStage(arn);

  if (stage !== undefined) {
    return stage;
  }

  const userPool = simWafUserPool(arn);

  if (userPool !== undefined) {
    return userPool;
  }

  const unsimulated = SimWafUnsimulatedResource.read(arn);

  if (unsimulated !== undefined) {
    return unsimulated;
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
 * The REST API stage an ARN names, or nothing when it names no stage.
 */
function restApiStage(arn: string): SimWafRestApiStage | undefined {
  const { groups } = restApiStagePattern.exec(arn) ?? {};

  if (groups === undefined) {
    return undefined;
  }

  return new SimWafRestApiStage({
    arn,
    regionName: groups["regionName"] ?? "",
    restApiId: groups["restApiId"] ?? "",
    stageName: groups["stageName"] ?? "",
  });
}

/**
 * The user pool an ARN names, or nothing when it names no pool.
 */
function simWafUserPool(arn: string): SimWafUserPool | undefined {
  const { groups } = userPoolPattern.exec(arn) ?? {};

  if (groups === undefined) {
    return undefined;
  }

  return new SimWafUserPool({
    arn,
    regionName: groups["regionName"] ?? "",
    accountId: groups["accountId"] ?? "",
    userPoolId: groups["userPoolId"] ?? "",
  });
}

/**
 * Refuse an Amplify app, whose web ACL is out of this WAFv2's reach.
 */
function refuseUnsimulatedResource(arn: string): void {
  if (amplifyAppPattern.test(arn)) {
    throw new SimWafUnsimulatedInputException(
      `AWS WAF protects an Amplify app with a CLOUDFRONT web ACL held in ` +
        `us-east-1, and a simulated WAFv2 associates web ACLs of its own ` +
        `Region only, so ${arn} is refused.`,
    );
  }
}
