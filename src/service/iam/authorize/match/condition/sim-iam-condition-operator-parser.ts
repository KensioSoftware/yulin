import type { SimIamConditionOperator } from "./sim-iam-condition-operator.js";
import { simIamComparisonKeywords } from "./comparison/sim-iam-comparison-keywords.js";
import {
  SimIamComparisonOperator,
  type SimIamSetQualifier,
} from "./sim-iam-comparison-operator.js";
import { SimIamIfExistsOperator } from "./sim-iam-if-exists-operator.js";
import { SimIamNull } from "./null/sim-iam-null.js";

const ifExistsSuffix = "IfExists";

const setQualifiers: ReadonlySet<string> = new Set([
  "ForAnyValue",
  "ForAllValues",
]);

/**
 * A keyword split into its set qualifier and the rest.
 */
interface QualifiedKeyword {
  readonly qualifier: SimIamSetQualifier;
  readonly keyword: string;
}

/**
 * Parses IAM condition operator keywords into their behavior objects.
 *
 * A keyword is a comparison such as `StringLike`, optionally qualified with
 * `ForAnyValue:` or `ForAllValues:` and optionally suffixed with `IfExists`.
 * `Null` takes neither.
 *
 * A keyword IAM does not define returns undefined, so that condition
 * evaluation fails closed without throwing.
 */
export class SimIamConditionOperatorParser {
  /**
   * Parse a keyword into a condition operator, if IAM defines it.
   */
  parse(keyword: string): SimIamConditionOperator | undefined {
    const qualified = this.qualified(keyword);

    if (qualified === undefined) {
      return undefined;
    }

    if (qualified.keyword === "Null") {
      return qualified.qualifier === undefined ? new SimIamNull() : undefined;
    }

    return this.comparisonOperator(qualified);
  }

  /**
   * Split the set qualifier from a keyword, refusing a prefix IAM does not
   * define.
   */
  private qualified(keyword: string): QualifiedKeyword | undefined {
    const [prefix = "", ...rest] = keyword.split(":");

    if (rest.length === 0) {
      return { qualifier: undefined, keyword };
    }

    const [unqualified = ""] = rest;

    if (!setQualifiers.has(prefix) || rest.length > 1) {
      return undefined;
    }

    return {
      qualifier: prefix as SimIamSetQualifier,
      keyword: unqualified,
    };
  }

  /**
   * Build a comparison operator, wrapping it when the keyword ends in
   * `IfExists`.
   */
  private comparisonOperator(
    qualified: QualifiedKeyword,
  ): SimIamConditionOperator | undefined {
    const ifExists = qualified.keyword.endsWith(ifExistsSuffix);
    const name = ifExists
      ? qualified.keyword.slice(0, -ifExistsSuffix.length)
      : qualified.keyword;
    const comparison = simIamComparisonKeywords.get(name);

    if (comparison === undefined) {
      return undefined;
    }

    const operator = new SimIamComparisonOperator(
      comparison,
      qualified.qualifier,
    );

    return ifExists ? new SimIamIfExistsOperator(operator) : operator;
  }
}
