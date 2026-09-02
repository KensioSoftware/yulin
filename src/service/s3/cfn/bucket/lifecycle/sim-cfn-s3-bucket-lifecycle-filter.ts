import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnValueShape } from "../../../../cloudformation/template/value/sim-cfn-value-shape.js";

interface SimCfnS3LifecycleFilterProperties {
  readonly shape: SimCfnValueShape;
  readonly rule: SimCfnTemplateValueRecord;
  readonly path: string;
}

/**
 * The `Filter` a rule's `TagFilters` states.
 *
 * CloudFormation puts the tags a rule filters on beside its `Prefix`, where the
 * request holds both inside a `Filter`, so a rule stating tags is read into the
 * shape the request takes. One tag and no prefix becomes a bare `Tag`, and
 * anything more an `And` holding the prefix and the tags together, which is
 * what real S3 requires of a rule scoped by more than one condition.
 *
 * A rule stating no tags keeps its `Prefix` where CloudFormation put it, and
 * gets no `Filter` at all.
 */
export function readSimCfnS3LifecycleFilter(
  properties: SimCfnS3LifecycleFilterProperties,
): SimCfnTemplateValue | undefined {
  const { shape, rule, path } = properties;
  const declared = rule["TagFilters"];

  if (declared === undefined) {
    return undefined;
  }

  const tags = shape
    .list(declared, `${path} TagFilters`)
    .map((tag, index) => shape.record(tag, `${path} TagFilters[${index}]`));
  const prefix = rule["Prefix"];
  const only = tags.length === 1 ? tags[0] : undefined;

  if (prefix === undefined && only !== undefined) {
    return { Tag: only };
  }

  return {
    And: { ...(prefix !== undefined && { Prefix: prefix }), Tags: tags },
  };
}
