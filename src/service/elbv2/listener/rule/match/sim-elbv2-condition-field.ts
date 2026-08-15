import type {
  SimElbV2ConditionValues,
  SimElbV2RuleConditionInput,
} from "../../../command/rule/rule-condition.command.js";
import type { SimElbV2ConditionMatcher } from "./sim-elbv2-condition-matcher.js";

interface SimElbV2ConditionFieldProperties {
  /**
   * Where this field keeps its values when they are written as a per-field
   * configuration rather than as a plain list.
   */
  readonly config: (
    input: SimElbV2RuleConditionInput,
  ) => SimElbV2ConditionValues | undefined;
  readonly matcher: (values: readonly string[]) => SimElbV2ConditionMatcher;
}

/**
 * One condition field a rule can be written on, and how a request is matched
 * against it.
 *
 * The field decides which configuration is read rather than the first one that
 * happens to be there, so a `host-header` condition carrying only a
 * `PathPatternConfig` has no values and is refused, as it is on real ELB.
 */
export class SimElbV2ConditionField {
  private readonly properties: SimElbV2ConditionFieldProperties;

  constructor(properties: SimElbV2ConditionFieldProperties) {
    this.properties = properties;
  }

  /**
   * The values a condition carries for this field, in either of the two forms
   * ELB writes them in.
   */
  values(input: SimElbV2RuleConditionInput): readonly string[] {
    return input.Values ?? this.properties.config(input)?.Values ?? [];
  }

  /**
   * Build what decides whether a request satisfies those values.
   */
  matcher(values: readonly string[]): SimElbV2ConditionMatcher {
    return this.properties.matcher(values);
  }
}
