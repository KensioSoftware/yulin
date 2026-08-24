import { SimCloudFrontResponseHeader } from "./sim-cf-response-header.js";
import { SimCloudFrontResponseHeadersPolicyCors } from "./sim-cf-response-headers-policy-cors.js";
import {
  SimCloudFrontResponseHeadersPolicy,
  type SimCloudFrontResponseHeadersPolicyId,
  type SimCloudFrontResponseHeadersPolicyMap,
} from "./sim-cf-response-headers-policy.js";

/**
 * The IDs AWS publishes for its managed response headers policies.
 *
 * A template names one of these directly. CDK's `ResponseHeadersPolicy`
 * statics carry the same five, and synthesize the ID into a Behavior's
 * `ResponseHeadersPolicyId` with no Resource behind it.
 */
export const simCfManagedResponseHeadersPolicyIds = {
  simpleCors: "60669652-455b-4ae9-85a4-c4c02393f86c",
  corsWithPreflight: "5cc3b908-e619-4b99-88e5-2cf7f45965bd",
  securityHeaders: "67f7725c-6f97-4210-82d7-5512b31e9d03",
  corsAndSecurityHeaders: "e61eb60c-9c35-4d20-a928-2b84e02af89c",
  corsWithPreflightAndSecurityHeaders: "eaab4381-ed33-4a86-88ca-d9558dc6cd63",
} as const;

/**
 * The security headers section the three managed policies that carry one set.
 *
 * All three carry the same list. Only `X-Content-Type-Options` overrides the
 * Origin, so a site sending its own `X-Frame-Options` keeps it while its
 * `nosniff` is replaced.
 */
function securityHeaders(): SimCloudFrontResponseHeader[] {
  return [
    new SimCloudFrontResponseHeader({
      name: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    }),
    new SimCloudFrontResponseHeader({
      name: "Strict-Transport-Security",
      value: "max-age=31536000",
    }),
    new SimCloudFrontResponseHeader({
      name: "X-Content-Type-Options",
      value: "nosniff",
      override: true,
    }),
    new SimCloudFrontResponseHeader({
      name: "X-Frame-Options",
      value: "SAMEORIGIN",
    }),
    new SimCloudFrontResponseHeader({
      name: "X-XSS-Protection",
      value: "1; mode=block",
    }),
  ];
}

/**
 * The CORS section behind SimpleCORS, allowing a simple request from any
 * Origin with `Access-Control-Allow-Origin` alone.
 */
function simpleCors(): SimCloudFrontResponseHeadersPolicyCors {
  return new SimCloudFrontResponseHeadersPolicyCors({
    allowCredentials: false,
    allowHeaders: [],
    allowMethods: [],
    allowOrigins: ["*"],
    originOverride: false,
  });
}

/**
 * The CORS section behind CORS-With-Preflight, which adds the method list and
 * a wildcard `Access-Control-Expose-Headers` to the wildcard Origin.
 */
function preflightCors(): SimCloudFrontResponseHeadersPolicyCors {
  return new SimCloudFrontResponseHeadersPolicyCors({
    allowCredentials: false,
    allowHeaders: [],
    allowMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
    allowOrigins: ["*"],
    exposeHeaders: ["*"],
    originOverride: false,
  });
}

/**
 * The five managed response headers policies, built fresh for one simulated
 * CloudFront.
 *
 * CloudFront owns these and every account has them, so a Behavior can name one
 * without a template creating anything. They are built per registry so that
 * one simulation never hands another a policy object.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html
 */
export function simCfManagedResponseHeadersPolicies(): SimCloudFrontResponseHeadersPolicyMap {
  const policies = [
    new SimCloudFrontResponseHeadersPolicy({
      id: simCfManagedResponseHeadersPolicyIds.simpleCors as SimCloudFrontResponseHeadersPolicyId,
      name: "SimpleCORS",
      cors: simpleCors(),
    }),
    new SimCloudFrontResponseHeadersPolicy({
      id: simCfManagedResponseHeadersPolicyIds.corsWithPreflight as SimCloudFrontResponseHeadersPolicyId,
      name: "CORS-With-Preflight",
      cors: preflightCors(),
    }),
    new SimCloudFrontResponseHeadersPolicy({
      id: simCfManagedResponseHeadersPolicyIds.securityHeaders as SimCloudFrontResponseHeadersPolicyId,
      name: "SecurityHeadersPolicy",
      securityHeaders: securityHeaders(),
    }),
    new SimCloudFrontResponseHeadersPolicy({
      id: simCfManagedResponseHeadersPolicyIds.corsAndSecurityHeaders as SimCloudFrontResponseHeadersPolicyId,
      name: "CORS-and-SecurityHeadersPolicy",
      cors: simpleCors(),
      securityHeaders: securityHeaders(),
    }),
    new SimCloudFrontResponseHeadersPolicy({
      id: simCfManagedResponseHeadersPolicyIds.corsWithPreflightAndSecurityHeaders as SimCloudFrontResponseHeadersPolicyId,
      name: "CORS-with-preflight-and-SecurityHeadersPolicy",
      cors: preflightCors(),
      securityHeaders: securityHeaders(),
    }),
  ];

  return new Map(policies.map((policy) => [policy.id, policy]));
}
