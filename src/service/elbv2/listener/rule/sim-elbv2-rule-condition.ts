import type {
  SimElbV2ConditionValues,
  SimElbV2RuleConditionInput,
} from "../../command/rule/rule-condition.command.js";
import {
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";

/**
 * The condition fields whose values are a plain list, and where each one keeps
 * them.
 *
 * The field decides which configuration is read rather than the first one that
 * happens to be there, so a `host-header` condition carrying only a
 * `PathPatternConfig` has no values and is refused, as it is on real ELB.
 */
const valueFields = new Map<
  string,
  (input: SimElbV2RuleConditionInput) => SimElbV2ConditionValues | undefined
>([
  [
    "host-header",
    (input): SimElbV2ConditionValues | undefined => input.HostHeaderConfig,
  ],
  [
    "path-pattern",
    (input): SimElbV2ConditionValues | undefined => input.PathPatternConfig,
  ],
  [
    "http-request-method",
    (input): SimElbV2ConditionValues | undefined =>
      input.HttpRequestMethodConfig,
  ],
  [
    "source-ip",
    (input): SimElbV2ConditionValues | undefined => input.SourceIpConfig,
  ],
]);

/**
 * The condition fields carrying a shape of their own rather than a value list,
 * each checked by its own rule.
 */
const shapedFields = new Set(["http-header", "query-string"]);

/**
 * Every condition field an Application Load Balancer rule can be written on.
 */
function simulatedFieldNames(): readonly string[] {
  return [...valueFields.keys(), ...shapedFields];
}

/**
 * One condition on a simulated listener rule.
 *
 * Conditions are held rather than matched here, and matching a request against
 * them is separate work. What this class owns is that a condition stored on a
 * rule is one that could match something: a field nothing understands, or a
 * field with nothing to compare against, is refused when the rule is written
 * rather than ignored when a request arrives.
 */
export class SimElbV2RuleCondition {
  public readonly field: string;

  private readonly input: SimElbV2RuleConditionInput;

  private constructor(input: SimElbV2RuleConditionInput, field: string) {
    // Copied, so that a caller mutating the command input it sent cannot
    // change what a rule matches on afterwards. Real ELB reads the request off
    // the wire, and nothing a caller does to its own objects reaches it.
    this.input = structuredClone(input);
    this.field = field;
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

    if (!valueFields.has(field) && !shapedFields.has(field)) {
      throw new SimElbV2UnsimulatedInputException(
        `Condition field '${field}' is not simulated. Simulated fields are ` +
          `${simulatedFieldNames().join(", ")}.`,
      );
    }

    const condition = new SimElbV2RuleCondition(input, field);

    condition.validate();

    return condition;
  }

  /**
   * Report this condition in the shape the SDK reads it back in.
   */
  view(): SimElbV2RuleConditionInput {
    return this.input;
  }

  private validate(): void {
    const readValues = valueFields.get(this.field);

    if (readValues === undefined) {
      this.validateShapedField();
      return;
    }

    if (
      (this.input.Values ?? readValues(this.input)?.Values ?? []).length === 0
    ) {
      throw new SimElbV2ValidationError(
        `A '${this.field}' condition requires at least one value`,
      );
    }
  }

  /**
   * Check a field whose values are not a plain list against its own rule.
   */
  private validateShapedField(): void {
    if (this.field === "http-header") {
      this.validateHttpHeader();
      return;
    }

    this.validateQueryString();
  }

  private validateHttpHeader(): void {
    const config = this.input.HttpHeaderConfig;

    if (config?.HttpHeaderName === undefined || config.HttpHeaderName === "") {
      throw new SimElbV2ValidationError(
        "An 'http-header' condition requires an HttpHeaderConfig with an " +
          "HttpHeaderName",
      );
    }

    if ((config.Values ?? []).length === 0) {
      throw new SimElbV2ValidationError(
        "An 'http-header' condition requires at least one value",
      );
    }
  }

  private validateQueryString(): void {
    if ((this.input.QueryStringConfig?.Values ?? []).length === 0) {
      throw new SimElbV2ValidationError(
        "A 'query-string' condition requires a QueryStringConfig with at " +
          "least one key and value pair",
      );
    }
  }
}
