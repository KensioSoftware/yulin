import type { SimCfnTemplateValue } from "../service/cloudformation/template/value/sim-cfn-template-value.js";
import { terraformAttributeReads } from "./sim-tf-attribute-reads.js";

/**
 * The CloudFormation intrinsic that reads one Terraform attribute off the
 * Resource standing in for the resource producing it.
 *
 * A reference naming a resource and no attribute is the resource itself, and
 * a `Ref` is what CloudFormation answers that with. An attribute is read
 * through whichever of `Ref` and `Fn::GetAtt` carries that value, which the
 * read table says and the two services often disagree about. An attribute the
 * table has no entry for answers with nothing.
 */
export function terraformAttributeIntrinsic(
  type: string,
  attribute: string | undefined,
  logicalId: string,
): SimCfnTemplateValue | undefined {
  const read =
    attribute === undefined
      ? "Ref"
      : terraformAttributeReads.get(`${type}.${attribute}`);

  if (read === undefined) {
    return undefined;
  }

  return read === "Ref"
    ? { Ref: logicalId }
    : { "Fn::GetAtt": [logicalId, read] };
}
