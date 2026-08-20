import type { SimWafByteMatchStatementInput } from "../statement/sim-waf-byte-match.js";
import type {
  SimWafFieldStatementInput,
  SimWafStatementInput,
} from "../statement/sim-waf-statement.type.js";

/**
 * What AWS charges for a byte match, by the kind of match it makes.
 */
const byteMatchBaseCosts: ReadonlyMap<string, number> = new Map([
  ["EXACTLY", 2],
  ["STARTS_WITH", 2],
  ["ENDS_WITH", 2],
  ["CONTAINS", 10],
  ["CONTAINS_WORD", 10],
]);

const regexMatchBaseCost = 3;
const regexPatternSetBaseCost = 25;
const sizeConstraintBaseCost = 1;
const labelMatchCost = 1;

/** What inspecting every query argument adds to a statement's base cost. */
const allQueryArgumentsCost = 10;

/** What each text transformation adds. */
const textTransformationCost = 10;

/**
 * What the statements that inspect a request cost.
 *
 * Only the kinds this simulation evaluates are counted. Every other kind is
 * refused where the rule is written, so a web ACL that has rules to add up
 * cannot hold one. Doubling the base cost for a JSON body never applies here
 * for the same reason.
 */
export function simWafMatchCapacity(statement: SimWafStatementInput): number {
  return (
    byteMatchCapacity(statement.ByteMatchStatement) +
    fieldCapacity(statement.RegexMatchStatement, regexMatchBaseCost) +
    fieldCapacity(
      statement.RegexPatternSetReferenceStatement,
      regexPatternSetBaseCost,
    ) +
    fieldCapacity(statement.SizeConstraintStatement, sizeConstraintBaseCost) +
    (statement.LabelMatchStatement === undefined ? 0 : labelMatchCost)
  );
}

/**
 * What a byte match costs, which depends on the match it makes.
 *
 * A constraint outside the five is refused where the rule is compiled, and
 * compiling happens before any of this.
 */
function byteMatchCapacity(
  statement:
    | (SimWafByteMatchStatementInput & SimWafFieldStatementInput)
    | undefined,
): number {
  const constraint = statement?.PositionalConstraint ?? "";

  return fieldCapacity(statement, byteMatchBaseCosts.get(constraint) ?? 0);
}

/**
 * A base cost plus what the field and the transformations add to it.
 */
function fieldCapacity(
  statement: SimWafFieldStatementInput | undefined,
  baseCost: number,
): number {
  if (statement === undefined) {
    return 0;
  }

  const transformed = (statement.TextTransformations ?? []).filter(
    (transformation) => transformation.Type !== "NONE",
  );
  const queryArguments =
    statement.FieldToMatch?.AllQueryArguments === undefined
      ? 0
      : allQueryArgumentsCost;

  return (
    baseCost + queryArguments + transformed.length * textTransformationCost
  );
}
