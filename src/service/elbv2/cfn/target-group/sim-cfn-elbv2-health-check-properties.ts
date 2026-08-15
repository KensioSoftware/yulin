import type { SimElbV2Matcher } from "../../command/sim-elbv2-shared.command.js";
import type { SimElbV2HealthCheckInput } from "../../target-group/sim-elbv2-health-check.js";
import type { SimCfnElbV2PropertyReader } from "../property/sim-cfn-elbv2-property-reader.js";

/**
 * The health check properties a target group Resource can declare.
 *
 * They are listed here so the target group's own property rules can say they
 * are acted on, and read here so the target group properties file stays about
 * what a target group is.
 */
export const simCfnElbV2HealthCheckProperties: readonly string[] = [
  "HealthCheckEnabled",
  "HealthCheckIntervalSeconds",
  "HealthCheckPath",
  "HealthCheckPort",
  "HealthCheckProtocol",
  "HealthCheckTimeoutSeconds",
  "HealthyThresholdCount",
  "UnhealthyThresholdCount",
  "Matcher",
];

/**
 * The health check settings a target group Resource declares.
 *
 * Nothing here ever checks a target's health, and every registered target is
 * healthy whatever these say. They are still read, because a stack declares
 * them and a test comparing what it deployed against what it meant to deploy
 * reads them back off the target group.
 */
export function simCfnElbV2HealthCheckInput(
  reader: SimCfnElbV2PropertyReader,
): SimElbV2HealthCheckInput {
  return {
    HealthCheckEnabled: reader.boolean("HealthCheckEnabled"),
    HealthCheckProtocol: reader.text("HealthCheckProtocol"),
    HealthCheckPort: reader.text("HealthCheckPort"),
    HealthCheckPath: reader.text("HealthCheckPath"),
    HealthCheckIntervalSeconds: reader.number("HealthCheckIntervalSeconds"),
    HealthCheckTimeoutSeconds: reader.number("HealthCheckTimeoutSeconds"),
    HealthyThresholdCount: reader.number("HealthyThresholdCount"),
    UnhealthyThresholdCount: reader.number("UnhealthyThresholdCount"),
    Matcher: reader.structure<SimElbV2Matcher>("Matcher"),
  };
}
