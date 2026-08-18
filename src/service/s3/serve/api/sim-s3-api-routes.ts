import { simS3BucketApiRoutes } from "./sim-s3-api-bucket-routes.js";
import { simS3ObjectApiRoutes } from "./sim-s3-api-object-routes.js";
import {
  simS3ApiRequestTarget,
  type SimS3ApiRequest,
} from "./sim-s3-api-request.js";
import type { SimS3ApiRoute } from "./sim-s3-api-route.type.js";

/**
 * The sub-resources these routes serve, which are the ones simulated S3
 * implements an operation for.
 */
const servedSubResources: readonly string[] = [
  "policy",
  "website",
  "publicAccessBlock",
  "notification",
  "delete",
  "uploads",
  "uploadId",
];

/**
 * Every sub-resource S3 defines, served here or not.
 *
 * A sub-resource has to be recognised by name rather than by shape. Both the
 * SDK and the CLI write one as `?acl=`, with an equals and nothing after it,
 * which is exactly how the CLI also writes the empty `prefix=` it sends on
 * every listing. Nothing in the query string separates the two, so the names
 * are listed instead of guessed at.
 */
const knownSubResources: ReadonlySet<string> = new Set([
  ...servedSubResources,
  "accelerate",
  "acl",
  "analytics",
  "cors",
  "encryption",
  "intelligent-tiering",
  "inventory",
  "legal-hold",
  "lifecycle",
  "location",
  "logging",
  "metrics",
  "object-lock",
  "ownershipControls",
  "policyStatus",
  "replication",
  "requestPayment",
  "restore",
  "retention",
  "select",
  "tagging",
  "torrent",
  "versioning",
  "versions",
]);

/**
 * The S3 operations reachable through the served AWS API endpoint, which are
 * the ones simulated S3 implements.
 */
export const simS3ApiRoutes: readonly SimS3ApiRoute[] = [
  ...simS3BucketApiRoutes,
  ...simS3ObjectApiRoutes,
];

/**
 * The sub-resource a request names that this endpoint does not serve.
 *
 * A sub-resource separates one operation from another on the same method and
 * path, so one that is not served has to be refused rather than ignored. An
 * ignored `?acl` on `GET /{Bucket}` is an Object listing, which is a confident
 * wrong answer to a question about permissions.
 */
export function simS3UnservedSubResource(
  request: SimS3ApiRequest,
): string | undefined {
  for (const name of request.query.keys()) {
    if (knownSubResources.has(name) && !servedSubResources.includes(name)) {
      return name;
    }
  }

  return undefined;
}

/**
 * Find the S3 operation a request names.
 *
 * Returns undefined for a request matching no route, which is either an
 * operation simulated S3 has not implemented or one real S3 does not have.
 */
export function resolveSimS3ApiRoute(
  request: SimS3ApiRequest,
): SimS3ApiRoute | undefined {
  const target = simS3ApiRequestTarget(request);
  const named = servedSubResources.find((name) => request.query.has(name));

  return simS3ApiRoutes.find(
    (route) =>
      route.method === request.method &&
      route.target === target &&
      route.subResource === named &&
      (route.matches?.(request.query) ?? true),
  );
}
