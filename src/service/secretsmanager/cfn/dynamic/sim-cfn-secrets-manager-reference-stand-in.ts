import type {
  SimCfnDynamicReference,
  SimCfnDynamicReferenceResolution,
} from "../../../cloudformation/template/dynamic/sim-cfn-dynamic-reference.type.js";

/**
 * The value a reference Secrets Manager could not answer resolves to.
 *
 * The shape follows the `ssm` references beside it, and CDK before them, which
 * fills an unresolved context lookup with `dummy-value-for-<name>`. A test
 * reading one back sees where it came from.
 */
export function simCfnSecretsManagerReferenceStandIn(
  reference: SimCfnDynamicReference,
  secretId: string,
  reason: string,
): SimCfnDynamicReferenceResolution {
  return {
    value: `dummy-value-for-${secretId}`,
    reason:
      `holds ${reference.text}, ${reason}, so the Resource is created ` +
      `with a stand-in value`,
  };
}
