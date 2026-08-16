import { SimLogsLogGroup } from "../../../../logs/group/sim-logs-log-group.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimLogsLogGroupCfn } from "./sim-logs-log-group-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated CloudWatch Logs
 * Resource.
 */
export function logsValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::Logs::LogGroup" &&
    properties.simResource instanceof SimLogsLogGroup
  ) {
    return new SimLogsLogGroupCfn({ group: properties.simResource });
  }

  return undefined;
}
