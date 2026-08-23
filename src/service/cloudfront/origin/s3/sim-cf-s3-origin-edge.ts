import { toEdgeOriginHeaders } from "../../edge/adapter/sim-lambda-edge-origin.js";
import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import { SimCfEdgeOriginNotSimulated } from "../sim-cf-edge-origin-not-simulated.error.js";
import type { SimCloudFrontS3OriginProperties } from "./sim-cloudfront-s3-origin.js";

/**
 * The domain name an Origin was configured with.
 *
 * An Origin built without one, as a narrow test does, reports the Bucket's
 * REST endpoint.
 */
export function s3OriginDomainName(
  properties: SimCloudFrontS3OriginProperties,
): string {
  return (
    properties.domainName ??
    `${properties.originBucket.bucket.bucketName}.s3.amazonaws.com`
  );
}

/**
 * An S3 Origin as an origin event presents it.
 *
 * The custom headers are empty whatever the Origin was configured with. An S3
 * Origin here reads its Bucket through GetObject rather than building an HTTP
 * request, so there is nothing for a header to travel on.
 */
export function s3OriginEdgeOrigin(
  properties: SimCloudFrontS3OriginProperties,
  domainName: string,
): LambdaAtEdge.Origin {
  return {
    s3: {
      authMethod: s3EdgeAuthMethod(
        properties.originAccessControl !== undefined,
      ),
      customHeaders: toEdgeOriginHeaders({}),
      domainName,
      path: properties.originPath ?? "",
      region: properties.originBucket.bucket.getAccountRegionScope().regionName,
    },
  };
}

/**
 * The Origin path an origin-request handler left on an S3 Origin.
 *
 * The path is the part the read obeys. The domain name is fixed, because the
 * Bucket behind it was resolved when the Distribution was written and nothing
 * here can resolve another one at request time, and so is the kind of Origin.
 */
export function s3OriginEdgePath(
  domainName: string,
  edgeOrigin: LambdaAtEdge.Origin,
): string {
  const { s3 } = edgeOrigin;

  if (s3 === undefined) {
    throw new SimCfEdgeOriginNotSimulated(
      `Sim CloudFront Origin ${domainName} is an S3 Origin, and a ` +
        `Lambda@Edge function handed back a custom Origin at origin-request. ` +
        `Switching an Origin between the two kinds is not simulated.`,
    );
  }

  if (s3.domainName !== domainName) {
    throw new SimCfEdgeOriginNotSimulated(
      `A Lambda@Edge function moved sim CloudFront S3 Origin ${domainName} ` +
        `to ${s3.domainName} at origin-request. An S3 Origin reads the Bucket ` +
        `its domain name resolved to when the Distribution was written, so ` +
        `moving one is not simulated.`,
    );
  }

  return s3.path;
}

/**
 * Whether CloudFront signs what it reads from the Bucket, in the terms an
 * origin event states it in.
 */
function s3EdgeAuthMethod(
  signed: boolean,
): LambdaAtEdge.S3Origin["authMethod"] {
  if (signed) {
    return "origin-access-identity";
  }

  return "none";
}
