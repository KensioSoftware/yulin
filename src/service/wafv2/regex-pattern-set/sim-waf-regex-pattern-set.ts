import {
  SimWafResource,
  type SimWafResourceProperties,
} from "../resource/sim-waf-resource.js";
import {
  compiledSimWafExpression,
  type SimWafRegularExpressionInput,
  simWafPatternStrings,
} from "./sim-waf-regular-expressions.js";

interface SimWafRegexPatternSetProperties extends SimWafResourceProperties {
  readonly regularExpressions: readonly SimWafRegularExpressionInput[];
}

/**
 * One named list of regular expressions a rule can point at.
 *
 * The patterns are compiled when the set is created, so an expression that
 * will not compile is refused where it was written rather than quietly
 * matching nothing when a request arrives.
 */
export class SimWafRegexPatternSet extends SimWafResource {
  #regularExpressions: readonly string[];
  #expressions: readonly RegExp[];

  constructor(properties: SimWafRegexPatternSetProperties) {
    super("regexpatternset", properties);

    this.#regularExpressions = simWafPatternStrings(
      properties.regularExpressions,
    );
    this.#expressions = this.#regularExpressions.map((pattern) =>
      compiledSimWafExpression(pattern),
    );
  }

  /**
   * The expressions this set holds, as they were written.
   */
  get regularExpressions(): readonly string[] {
    return this.#regularExpressions;
  }

  /**
   * The expressions this set holds, compiled.
   */
  get expressions(): readonly RegExp[] {
    return this.#expressions;
  }

  /**
   * Write a new list of expressions over this one.
   *
   * Every expression is compiled before anything is replaced. A set that
   * refuses an update keeps the expressions it had.
   */
  replaceExpressions(properties: {
    readonly regularExpressions: readonly SimWafRegularExpressionInput[];
    readonly description?: string | undefined;
    readonly lockToken: string | undefined;
  }): void {
    const patterns = simWafPatternStrings(properties.regularExpressions);
    const expressions = patterns.map((pattern) =>
      compiledSimWafExpression(pattern),
    );

    this.takeLock(properties.lockToken);
    this.replaceDescription(properties.description);
    this.#regularExpressions = patterns;
    this.#expressions = expressions;
  }
}

export { type SimWafRegularExpressionInput } from "./sim-waf-regular-expressions.js";
