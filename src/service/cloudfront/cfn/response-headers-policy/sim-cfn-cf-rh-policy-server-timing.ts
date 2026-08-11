import { SimCloudFrontResponseHeader } from "../../response-headers-policy/sim-cf-response-header.js";
import {
  optionalObject,
  requiredBoolean,
  type SimCfnCfRhPolicyFieldRefuse,
} from "./sim-cfn-cf-rh-policy-field-reader.js";

/**
 * Reads a ResponseHeadersPolicyConfig's ServerTimingHeadersConfig section
 * into the Server-Timing header it enables, or nothing when it is absent or
 * disabled.
 *
 * `SamplingRate` decides what share of real responses carry the header; this
 * simulation always adds it once `Enabled` is true rather than sampling, so a
 * test asserting on it does not depend on chance.
 */
export function simCfnCfResponseHeadersPolicyServerTiming(
  config: Record<string, unknown>,
  refuse: SimCfnCfRhPolicyFieldRefuse,
): SimCloudFrontResponseHeader | undefined {
  const section = optionalObject(
    config,
    "ServerTimingHeadersConfig",
    "ServerTimingHeadersConfig",
    refuse,
  );

  if (
    section === undefined ||
    !requiredBoolean(section, "Enabled", "ServerTimingHeadersConfig", refuse)
  ) {
    return undefined;
  }

  return new SimCloudFrontResponseHeader({
    name: "Server-Timing",
    value: `cdn-upstream-layer;desc="EDGE"`,
    override: true,
  });
}
