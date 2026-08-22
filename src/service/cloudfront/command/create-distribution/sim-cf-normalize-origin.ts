import type {
  SimCloudFrontOriginConfig,
  SimCloudFrontOriginCustomHeader,
} from "./create-distribution.command.js";
import { normalizeSimCfList } from "./sim-cf-normalize-list.js";

/**
 * Normalize the custom header list on an Origin.
 *
 * The CloudFront API and CloudFormation name the field differently, so both
 * names are normalized here and whichever one the caller wrote reaches the
 * Origin the same way.
 */
export function normalizeSimCfOrigin(
  origin: SimCloudFrontOriginConfig,
): SimCloudFrontOriginConfig {
  const originRecord = origin as Record<string, object>;

  return {
    ...origin,
    CustomHeaders: normalizeSimCfList<SimCloudFrontOriginCustomHeader>(
      "CustomHeaders",
      originRecord["CustomHeaders"],
    ),
    OriginCustomHeaders: normalizeSimCfList<SimCloudFrontOriginCustomHeader>(
      "OriginCustomHeaders",
      originRecord["OriginCustomHeaders"],
    ),
  };
}
