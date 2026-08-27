import {
  SimCfnOrganization,
  SimCfnOrganizationsAccount,
  SimCfnOrganizationsPolicy,
} from "../../../../organizations/cfn/sim-cfn-organizations-record.js";
import { SimOrganizationsOrganizationalUnit } from "../../../../organizations/tree/sim-organizations-node.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import {
  SimOrganizationalUnitCfn,
  SimOrganizationCfn,
  SimOrganizationsAccountCfn,
  SimOrganizationsPolicyCfn,
} from "./sim-organizations-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated Organizations
 * Resource.
 */
export function organizationsValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  const { simResource } = properties;

  if (simResource instanceof SimCfnOrganization) {
    return new SimOrganizationCfn(simResource);
  }

  if (simResource instanceof SimOrganizationsOrganizationalUnit) {
    return new SimOrganizationalUnitCfn(simResource);
  }

  if (simResource instanceof SimCfnOrganizationsAccount) {
    return new SimOrganizationsAccountCfn(simResource);
  }

  if (simResource instanceof SimCfnOrganizationsPolicy) {
    return new SimOrganizationsPolicyCfn(simResource);
  }

  return undefined;
}
