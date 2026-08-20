import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";
import type { SimWafValueTest } from "./sim-waf-field-match.js";

/**
 * Minimal structural WAFv2 ByteMatchStatement.
 */
export interface SimWafByteMatchStatementInput {
  readonly SearchString?: Uint8Array | string | undefined;
  readonly PositionalConstraint?: string | undefined;
}

const decoder = new TextDecoder();

/**
 * Characters WAF counts as part of a word, for CONTAINS_WORD.
 */
const wordCharacter = /[\da-z_]/iu;

/**
 * Build the test a ByteMatchStatement puts each string through.
 *
 * Matching is case sensitive here as it is on AWS. A rule that means to ignore
 * case says so with a LOWERCASE text transformation and a lower case search
 * string, which is why the transformations are part of the statement rather
 * than a property of the comparison.
 */
export function simWafByteMatchTest(
  statement: SimWafByteMatchStatementInput,
  ruleName: string,
): SimWafValueTest {
  const searchString = readSearchString(statement.SearchString, ruleName);
  const constraint = statement.PositionalConstraint ?? "";

  switch (constraint) {
    case "EXACTLY": {
      return (value): boolean => value === searchString;
    }
    case "STARTS_WITH": {
      return (value): boolean => value.startsWith(searchString);
    }
    case "ENDS_WITH": {
      return (value): boolean => value.endsWith(searchString);
    }
    case "CONTAINS": {
      return (value): boolean => value.includes(searchString);
    }
    case "CONTAINS_WORD": {
      return (value): boolean => containsWord(value, searchString);
    }
    default: {
      invalidSimWafRule(
        ruleName,
        `The positional constraint ${String(statement.PositionalConstraint)} ` +
          `is not valid`,
      );
    }
  }
}

/**
 * Whether the search string appears in the value as a word of its own.
 *
 * A word here is what WAF says it is: the match has to start at the beginning
 * of the value or after something that is not a letter, digit or underscore,
 * and end at the end of the value or before something that is not.
 */
function containsWord(value: string, searchString: string): boolean {
  let from = value.indexOf(searchString);

  while (from !== -1) {
    if (
      isBoundary(value[from - 1]) &&
      isBoundary(value[from + searchString.length])
    ) {
      return true;
    }

    from = value.indexOf(searchString, from + 1);
  }

  return false;
}

function isBoundary(character: string | undefined): boolean {
  return character === undefined || !wordCharacter.test(character);
}

function readSearchString(
  searchString: Uint8Array | string | undefined,
  ruleName: string,
): string {
  if (searchString === undefined) {
    invalidSimWafRule(ruleName, "ByteMatchStatement needs a SearchString");
  }

  return typeof searchString === "string"
    ? searchString
    : decoder.decode(searchString);
}
