import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";

/**
 * The `State` the expanded rule or schedule is created in.
 *
 * A SAM event says this twice over. `State` is the string the Resource itself
 * takes, and `Enabled` is the boolean SAM had first, so an event stating the
 * string is carried across and an event stating the boolean is turned into
 * one. An event stating neither leaves the Resource to its own default, which
 * is enabled.
 *
 * `Enabled` written as anything but a boolean is left alone rather than read
 * for truthiness. A template holding it as an unresolved intrinsic is the one
 * way that happens, and a rule silently disabled by a value nobody read is
 * worse than one deployed enabled.
 */
export function samEventStateProperty(
  properties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const state = properties["State"];

  if (typeof state === "string") {
    return { State: state };
  }

  const enabled = properties["Enabled"];

  if (typeof enabled !== "boolean") {
    return {};
  }

  return { State: enabled ? "ENABLED" : "DISABLED" };
}
