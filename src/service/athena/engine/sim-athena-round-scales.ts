import { isRecord } from "../../../util/type-guard/record.js";

/**
 * The decimal places each result column was rounded to, by position.
 *
 * `round(x, 1)` answers `25.0` on Trino and `25` here, because SQLite hands
 * back a double and nothing downstream knows how many places the statement
 * asked to keep. The statement is the only thing that knows, so the scale is
 * read off the syntax tree while it is still there and travels with the query.
 *
 * Only a literal scale is read. `round(x, n)` over a column is a scale that
 * differs per row, and a result column has one rendering for every row in it.
 */
export function simAthenaRoundScales(
  ast: unknown,
): ReadonlyMap<number, number> {
  const scales = new Map<number, number>();

  for (const [index, item] of selectItems(ast).entries()) {
    const scale = roundScaleOf(item);

    if (scale !== undefined) {
      scales.set(index, scale);
    }
  }

  return scales;
}

/**
 * One rounded value as its column renders it.
 *
 * A whole number keeps the trailing zeros the scale asked for, which is the
 * whole point of carrying the scale this far.
 */
export function simAthenaRoundedText(value: unknown, scale: number): string {
  return typeof value === "number" ? value.toFixed(scale) : String(value);
}

/**
 * The select list of the statement, which is the first one where a query
 * carries several.
 */
function selectItems(ast: unknown): readonly unknown[] {
  const statement: unknown = Array.isArray(ast) ? ast[0] : ast;
  const columns = isRecord(statement) ? statement["columns"] : undefined;

  return Array.isArray(columns) ? columns : [];
}

/**
 * The scale one select item was rounded to, for an item that is a `round` call
 * over a literal scale.
 */
function roundScaleOf(item: unknown): number | undefined {
  const expression = isRecord(item) ? item["expr"] : undefined;

  if (!isRecord(expression) || functionNameOf(expression) !== "round") {
    return undefined;
  }

  const arguments_ = callArguments(expression);

  return arguments_.length === 2 ? literalScale(arguments_[1]) : undefined;
}

/**
 * The name a function call node carries, which the parser holds as a list of
 * the parts a qualified name would have.
 */
function functionNameOf(expression: Record<string, unknown>): string {
  const name = isRecord(expression["name"])
    ? expression["name"]["name"]
    : undefined;
  const first: unknown = Array.isArray(name) ? name[0] : undefined;
  const value = isRecord(first) ? first["value"] : undefined;

  return typeof value === "string" ? value.toLowerCase() : "";
}

/**
 * The arguments a function call node carries.
 */
function callArguments(
  expression: Record<string, unknown>,
): readonly unknown[] {
  const arguments_ = expression["args"];
  const value = isRecord(arguments_) ? arguments_["value"] : undefined;

  return Array.isArray(value) ? value : [];
}

/**
 * A whole number written into the statement, or nothing for anything else.
 */
function literalScale(node: unknown): number | undefined {
  const value =
    isRecord(node) && node["type"] === "number" ? node["value"] : undefined;
  const scale = Number(value);

  return Number.isSafeInteger(scale) && scale >= 0 ? scale : undefined;
}
