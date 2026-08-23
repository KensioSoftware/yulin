import {
  fromEdgeOriginHeaders,
  toEdgeOriginHeaders,
} from "../../edge/adapter/sim-lambda-edge-origin.js";
import type { LambdaAtEdge } from "../../typings/lambda-at-edge.namespace.js";
import { SimCfEdgeOriginNotSimulated } from "../sim-cf-edge-origin-not-simulated.error.js";

/**
 * The parts of a custom Origin an origin event carries and a handler can
 * rewrite. `SimCloudFrontCustomOrigin` holds the rest.
 */
export interface SimCfCustomOriginEdgeParts {
  readonly domainName: string;
  readonly originPath: string;
  readonly customHeaders: Readonly<Record<string, string>>;
}

/**
 * A custom Origin as an origin event presents it.
 *
 * The connection settings are the ones CloudFront defaults a custom Origin to.
 * Nothing here opens a socket, so a handler reading them sees what a
 * Distribution would report and a handler writing them changes nothing.
 */
export function customOriginEdgeOrigin(
  parts: SimCfCustomOriginEdgeParts,
): LambdaAtEdge.Origin {
  return {
    custom: {
      customHeaders: toEdgeOriginHeaders(parts.customHeaders),
      domainName: parts.domainName,
      path: parts.originPath,
      keepaliveTimeout: 5,
      port: 443,
      protocol: "https",
      readTimeout: 30,
      sslProtocols: ["TLSv1.2"],
    },
  };
}

/**
 * The custom Origin an origin-request handler left, ready to fetch from.
 *
 * A handler that handed back an S3 Origin asked for a switch this simulation
 * cannot make: the Bucket behind a domain name is resolved when the
 * Distribution is written.
 */
export function customOriginEdgeParts(
  originId: string,
  edgeOrigin: LambdaAtEdge.Origin,
): SimCfCustomOriginEdgeParts {
  const { custom } = edgeOrigin;

  if (custom === undefined) {
    throw new SimCfEdgeOriginNotSimulated(
      `Sim CloudFront Origin ${originId} is a custom Origin, and a ` +
        `Lambda@Edge function handed back an S3 Origin at origin-request. ` +
        `Switching an Origin between the two kinds is not simulated.`,
    );
  }

  return {
    domainName: custom.domainName,
    originPath: custom.path,
    customHeaders: fromEdgeOriginHeaders(custom.customHeaders),
  };
}
