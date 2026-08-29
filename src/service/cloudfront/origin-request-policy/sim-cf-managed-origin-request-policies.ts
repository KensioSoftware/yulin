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
 * The eight managed origin request policies, built fresh for one simulated
 * CloudFront.
 *
 * CloudFront owns these and every account has them, so a Behavior can name one
 * without a template creating anything. Each carries the ID and the name AWS
 * publishes for it. What each one forwards is left out, along with what a
 * policy a template creates forwards.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
 */
export function simCfManagedOriginRequestPolicies(): SimCloudFrontOriginRequestPolicyMap {
  const policies = [
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.allViewer,
      "AllViewer",
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.allViewerAndCloudFrontHeaders2022,
      "AllViewerAndCloudFrontHeaders-2022-06",
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.allViewerExceptHostHeader,
      "AllViewerExceptHostHeader",
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.corsCustomOrigin,
      "CORS-CustomOrigin",
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.corsS3Origin,
      "CORS-S3Origin",
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.elementalMediaTailorPersonalizedManifests,
      "Elemental-MediaTailor-PersonalizedManifests",
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.hostHeaderOnly,
      "HostHeaderOnly",
    ),
    managedOriginRequestPolicy(
      simCfManagedOriginRequestPolicyIds.userAgentRefererHeaders,
      "UserAgentRefererHeaders",
    ),
  ];

  return new Map(policies.map((policy) => [policy.id, policy]));
}

/**
 * One managed policy, under the ID and the name AWS gives it.
 */
function managedOriginRequestPolicy(
  id: string,
  name: string,
): SimCloudFrontOriginRequestPolicy {
  return new SimCloudFrontOriginRequestPolicy({
    id: id as SimCloudFrontOriginRequestPolicyId,
    name,
  });
}
