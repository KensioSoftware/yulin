import type {
  SimCfnDynamicReference,
  SimCfnDynamicReferenceResolution,
} from "../../../cloudformation/template/dynamic/sim-cfn-dynamic-reference.type.js";

/**
 * The value a reference Parameter Store could not answer resolves to.
 *
 * The shape follows CDK, which fills an unresolved context lookup with
 * `dummy-value-for-<name>`. A test reading one back sees where it came from.
 * `ssm` and `ssm-secure` references both take this path, and both record the
 * reason against the property that held the reference.
 */
export function simCfnSsmReferenceStandIn(
  reference: SimCfnDynamicReference,
  name: string,
  reason: string,
): SimCfnDynamicReferenceResolution {
  return {
    value: `dummy-value-for-${name}`,
    reason:
      `holds ${reference.text}, ${reason}, so the Resource is created ` +
      `with a stand-in value`,
  };
}
