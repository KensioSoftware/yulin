import { readSimElbV2Name } from "../sim-elbv2-resource-name.js";

/**
 * Read the name of a target group a request names.
 *
 * Real ELB reserves nothing at the front of a target group name, unlike a load
 * balancer name, because nothing derives a host name from it.
 */
export function simElbV2TargetGroupName(value: string | undefined): string {
  return readSimElbV2Name("Name", value ?? "");
}
