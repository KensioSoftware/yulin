import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../template/value/sim-cfn-template-value.js";
import { isRecord } from "../../../util/type-guard/record.js";

const subVariablePattern = /\$\{(?<name>[^!}][^}]*)\}/gu;

/**
 * The logical IDs of the Resources a template reads an attribute of, through
 * `Fn::GetAtt` or a `${LogicalId.Attribute}` in `Fn::Sub`, anywhere in its
 * Resources or Outputs.
 *
 * This reads the raw template, before conditions are applied. A `Fn::GetAtt`
 * in an `Fn::If` branch the conditions rule out still counts, which can
 * authorize a read real CloudFormation would not make.
 */
export function simCfnAttributeReads(
  template: CfnTemplateBodyRecord,
): ReadonlySet<string> {
  const reads = new Set<string>();

  collect(template.Resources, reads);
  collect(template.Outputs ?? {}, reads);

  return reads;
}

function collect(value: SimCfnTemplateValue, reads: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collect(item, reads);
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (key === "Fn::GetAtt") {
      addGetAttTarget(entry, reads);
    } else if (key === "Fn::Sub") {
      addSubTargets(entry, reads);
    }

    collect(entry, reads);
  }
}

/** `["Logical", "Attribute"]`, or the short form `"Logical.Attribute"`. */
function addGetAttTarget(value: SimCfnTemplateValue, reads: Set<string>): void {
  const target = Array.isArray(value) ? value[0] : value;

  if (typeof target === "string") {
    reads.add(target.split(".", 1)[0] ?? target);
  }
}

/**
 * A `${Logical.Attribute}` in a `Fn::Sub` string. A name the Sub's own
 * variable map gives is a variable and reads no Resource, and `${!Literal}` is
 * escaped text.
 */
function addSubTargets(value: SimCfnTemplateValue, reads: Set<string>): void {
  const [text, variables] = Array.isArray(value) ? value : [value, undefined];

  if (typeof text !== "string") {
    return;
  }

  for (const match of text.matchAll(subVariablePattern)) {
    const name = match.groups?.["name"] ?? "";
    const [logicalId, attribute] = name.split(".", 2);

    if (
      logicalId !== undefined &&
      attribute !== undefined &&
      !(isRecord(variables) && Object.hasOwn(variables, name))
    ) {
      reads.add(logicalId);
    }
  }
}
