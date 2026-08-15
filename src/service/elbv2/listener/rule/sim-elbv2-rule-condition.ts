import type { SimElbV2RuleConditionInput } from "../../command/rule/rule-condition.command.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { requireSimElbV2ConditionField } from "./match/sim-elbv2-condition-fields.js";
import type { SimElbV2ConditionMatcher } from "./match/sim-elbv2-condition-matcher.js";
import type { SimElbV2MatchableRequest } from "./match/sim-elbv2-matchable-request.js";

/**
 * One condition on a simulated listener rule.
 *
 * A condition is read once, when the rule is written, and what comes out of it
 * is the thing that matches a request. A field nothing here understands, or a
 * field with nothing to compare against, is refused at that point rather than
 * stored and then never claiming a request.
 */
export class SimElbV2RuleCondition {
  public readonly field: string;

  private readonly input: SimElbV2RuleConditionInput;
  private readonly matcher: SimElbV2ConditionMatcher;

  private constructor(
    input: SimElbV2RuleConditionInput,
    field: string,
    matcher: SimElbV2ConditionMatcher,
  ) {
    // Copied, so that a caller mutating the command input it sent cannot
    // change what a rule matches on afterwards. Real ELB reads the request off
    // the wire, and nothing a caller does to its own objects reaches it.
    this.input = structuredClone(input);
    this.field = field;
    this.matcher = matcher;
  }

  /**
   * Read the conditions a request carries, refusing an empty or absent list.
   */
  static readAll(
    conditions: readonly SimElbV2RuleConditionInput[] | undefined,
  ): readonly SimElbV2RuleCondition[] {
    if (conditions === undefined || conditions.length === 0) {
      throw new SimElbV2ValidationError(
        "Conditions must hold at least one condition",
      );
    }

    return conditions.map((condition) => this.read(condition));
  }

  /**
   * Read one condition, refusing a field or value list ELB would not take.
   */
  static read(input: SimElbV2RuleConditionInput): SimElbV2RuleCondition {
    const field = input.Field;

    if (field === undefined || field === "") {
      throw new SimElbV2ValidationError("Conditions member requires a Field");
    }

    const definition = requireSimElbV2ConditionField(field);
    const values = definition.values(input);

    if (values.length === 0) {
      throw new SimElbV2ValidationError(
        `A '${field}' condition requires at least one value`,
      );
    }

    return new SimElbV2RuleCondition(input, field, definition.matcher(values));
  }

  /**
   * Whether a request satisfies this condition.
   */
  matches(request: SimElbV2MatchableRequest): boolean {
    return this.matcher.matches(request);
  }

  /**
   * Report this condition in the shape the SDK reads it back in.
   */
  view(): SimElbV2RuleConditionInput {
    return this.input;
  }
}
