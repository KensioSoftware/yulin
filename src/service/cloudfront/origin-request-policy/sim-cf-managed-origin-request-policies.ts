import { SimCfOriginRequestForwarding } from "./sim-cf-origin-request-forwarding.js";
import {
  SimCloudFrontOriginRequestPolicy,
  type SimCloudFrontOriginRequestPolicyId,
  type SimCloudFrontOriginRequestPolicyMap,
} from "./sim-cf-origin-request-policy.js";

/**
 * The IDs AWS publishes for its managed origin request policies.
 *
 * A template names one of these directly. CDK's `OriginRequestPolicy` statics
 * carry the same eight, and synthesize the ID into a Behavior's
 * `OriginRequestPolicyId` with no Resource behind it.
 */
export const simCfManagedOriginRequestPolicyIds = {
  allViewer: "216adef6-5c7f-47e4-b989-5492eafa07d3",
  allViewerAndCloudFrontHeaders2022: "33f36d7e-f396-46d9-90e0-52428a34d9dc",
  allViewerExceptHostHeader: "b689b0a8-53d0-40ab-baf2-68738e2966ac",
  corsCustomOrigin: "59781a5b-3903-41f3-afcb-af62929ccde1",
  corsS3Origin: "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf",
  elementalMediaTailorPersonalizedManifests:
    "775133bc-15f2-49f9-abea-afb2e0bf67d2",
  hostHeaderOnly: "bf0718e1-ba1e-49d1-88b1-f726733018ae",
  userAgentRefererHeaders: "acba4595-bd28-49b8-b9fe-13317c0390fa",
} as const;

/**
 * The CloudFront headers `AllViewerAndCloudFrontHeaders-2022-06` adds to the
 * viewer's own. They are the ones CloudFront had released by June 2022, and
 * the policy is pinned to that set rather than growing with CloudFront.
 */
const cloudFrontHeaders2022 = [
  "CloudFront-Forwarded-Proto",
  "CloudFront-Is-Android-Viewer",
  "CloudFront-Is-Desktop-Viewer",
  "CloudFront-Is-IOS-Viewer",
  "CloudFront-Is-Mobile-Viewer",
  "CloudFront-Is-SmartTV-Viewer",
  "CloudFront-Is-Tablet-Viewer",
  "CloudFront-Viewer-Address",
  "CloudFront-Viewer-ASN",
  "CloudFront-Viewer-City",
  "CloudFront-Viewer-Country",
  "CloudFront-Viewer-Country-Name",
  "CloudFront-Viewer-Country-Region",
  "CloudFront-Viewer-Country-Region-Name",
  "CloudFront-Viewer-Http-Version",
  "CloudFront-Viewer-Latitude",
  "CloudFront-Viewer-Longitude",
  "CloudFront-Viewer-Metro-Code",
  "CloudFront-Viewer-Postal-Code",
  "CloudFront-Viewer-Time-Zone",
  "CloudFront-Viewer-TLS",
];

/**
 * The CORS request headers `CORS-S3Origin` forwards, which
 * `Elemental-MediaTailor-PersonalizedManifests` forwards along with two of its
 * own.
 */
const corsRequestHeaders = [
  "Origin",
  "Access-Control-Request-Headers",
  "Access-Control-Request-Method",
];

/**
 * The eight managed origin request policies, built fresh for one simulated
 * CloudFront.
 *
 * CloudFront owns these and every account has them, so a Behavior can name one
 * without a template creating anything. Each carries the ID, the name and the
 * three sections AWS publishes for it, so an Origin behind `AllViewer` here
 * reads what one behind `AllViewer` in an account reads.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
 */
export function simCfManagedOriginRequestPolicies(): SimCloudFrontOriginRequestPolicyMap {
  const policies = [
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.allViewer,
      "AllViewer",
      new SimCfOriginRequestForwarding({
        cookieBehavior: "all",
        headerBehavior: "allViewer",
        queryStringBehavior: "all",
      }),
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.allViewerAndCloudFrontHeaders2022,
      "AllViewerAndCloudFrontHeaders-2022-06",
      new SimCfOriginRequestForwarding({
        cookieBehavior: "all",
        headerBehavior: "allViewerAndWhitelistCloudFront",
        headers: cloudFrontHeaders2022,
        queryStringBehavior: "all",
      }),
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.allViewerExceptHostHeader,
      "AllViewerExceptHostHeader",
      new SimCfOriginRequestForwarding({
        cookieBehavior: "all",
        headerBehavior: "allExcept",
        headers: ["Host"],
        queryStringBehavior: "all",
      }),
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.corsCustomOrigin,
      "CORS-CustomOrigin",
      new SimCfOriginRequestForwarding({
        headerBehavior: "whitelist",
        headers: ["Origin"],
      }),
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.corsS3Origin,
      "CORS-S3Origin",
      new SimCfOriginRequestForwarding({
        headerBehavior: "whitelist",
        headers: corsRequestHeaders,
      }),
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.elementalMediaTailorPersonalizedManifests,
      "Elemental-MediaTailor-PersonalizedManifests",
      new SimCfOriginRequestForwarding({
        headerBehavior: "whitelist",
        headers: [...corsRequestHeaders, "User-Agent", "X-Forwarded-For"],
        queryStringBehavior: "all",
      }),
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.hostHeaderOnly,
      "HostHeaderOnly",
      new SimCfOriginRequestForwarding({
        headerBehavior: "whitelist",
        headers: ["Host"],
      }),
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.userAgentRefererHeaders,
      "UserAgentRefererHeaders",
      new SimCfOriginRequestForwarding({
        headerBehavior: "whitelist",
        headers: ["User-Agent", "Referer"],
      }),
    ),
  ];

  return new Map(policies.map((policy) => [policy.id, policy]));
}

/**
 * One managed policy, under the ID, the name and the sections AWS gives it.
 */
function managedOriginRequestPolicy(
  id: string,
  name: string,
  forwarding: SimCfOriginRequestForwarding,
): SimCloudFrontOriginRequestPolicy {
  return new SimCloudFrontOriginRequestPolicy({
    id: id as SimCloudFrontOriginRequestPolicyId,
    name,
    forwarding,
  });
}
