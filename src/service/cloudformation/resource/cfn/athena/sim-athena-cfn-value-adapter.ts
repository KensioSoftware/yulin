import { SimAthenaNamedQuery } from "../../../../athena/named-query/sim-athena-named-query.js";
import { SimAthenaWorkGroup } from "../../../../athena/workgroup/sim-athena-work-group.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimAthenaNamedQueryCfn } from "./sim-athena-named-query-cfn.js";
import { SimAthenaWorkGroupCfn } from "./sim-athena-work-group-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated Athena Resource.
 */
export function athenaValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  if (
    properties.type === "AWS::Athena::WorkGroup" &&
    properties.simResource instanceof SimAthenaWorkGroup
  ) {
    return new SimAthenaWorkGroupCfn({ workGroup: properties.simResource });
  }

  if (
    properties.type === "AWS::Athena::NamedQuery" &&
    properties.simResource instanceof SimAthenaNamedQuery
  ) {
    return new SimAthenaNamedQueryCfn({ namedQuery: properties.simResource });
  }

  return undefined;
}
