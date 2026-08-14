import type { SimElbV2RuleConditionInput } from "../../command/rule/rule-condition.command.js";
import {
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";

/**
 * The condition fields an Application Load Balancer rule can be written on.
 */
const simulatedFields = new Set([
  "host-header",
  "path-pattern",
  "http-header",
  "http-request-method",
  "query-string",
  "source-ip",
]);

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
    this.input = input;
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

    if (!simulatedFields.has(field)) {
      throw new SimElbV2UnsimulatedInputException(
        `Condition field '${field}' is not simulated. Simulated fields are ` +
          `${[...simulatedFields].join(", ")}.`,
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
    if (this.field === "http-header") {
      this.validateHttpHeader();
      return;
    }

    if (this.field === "query-string") {
      this.validateQueryString();
      return;
    }

    if (this.valueCount() === 0) {
      throw new SimElbV2ValidationError(
        `A '${this.field}' condition requires at least one value`,
      );
    }
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

  /**
   * How many values this condition compares against, in either of the two
   * forms ELB takes them in.
   */
  private valueCount(): number {
    const configValues =
      this.input.HostHeaderConfig ??
      this.input.PathPatternConfig ??
      this.input.HttpRequestMethodConfig ??
      this.input.SourceIpConfig;

    return (this.input.Values ?? configValues?.Values ?? []).length;
  }
}
