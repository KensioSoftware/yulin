import { SimDeclaredResultRules } from "../../../util/rule/sim-declared-result-rules.js";
import { SimAthenaInvalidRequestException } from "../error/sim-athena.error.js";
import type { SimAthenaDeclaredResult } from "./sim-athena-declared-result.js";
import { SimAthenaResolvedResult } from "./sim-athena-resolved-result.js";

/**
 * What a result rule is matched against.
 */
export interface SimAthenaResultRequest {
  readonly queryString?: string | undefined;
  readonly workGroupName?: string | undefined;
}

/**
 * The results one simulated Athena scope answers queries with.
 *
 * A rule for an exact query wins, then a rule for a workgroup, then the
 * default. That ordering is `SimDeclaredResultRules`, which simulated Bedrock
 * answers prompts with and simulated Rekognition answers images with. What is
 * Athena's own is which key each tier holds.
 *
 * The query is the specific tier and the workgroup the broad one. A workgroup
 * rule covers every query a stack's rollups run, which is what a test
 * asserting on the code around the call wants. A query rule picks out the one
 * statement a test is about.
 *
 * Matching is exact, with no pattern syntax, for the reason it is exact in
 * Rekognition. A partial match forces a specificity rule, and a specificity
 * rule is where a surprising answer comes from. The SQL is never parsed, so
 * two queries differing only in whitespace are two different keys.
 */
export class SimAthenaQueryResults {
  readonly #rules = new SimDeclaredResultRules<SimAthenaResolvedResult>(
    new SimAthenaResolvedResult({}),
  );

  /**
   * Answer with this result for any query no other rule matches.
   */
  byDefault(result: SimAthenaDeclaredResult): void {
    this.#rules.byDefault(new SimAthenaResolvedResult(result));
  }

  /**
   * Answer with this result for this exact query text.
   */
  onQuery(queryString: string, result: SimAthenaDeclaredResult): void {
    this.#rules.onLeadingKey(
      requiredRuleKey(queryString, "a query"),
      new SimAthenaResolvedResult(result),
    );
  }

  /**
   * Answer with this result for any query in this workgroup, where no query
   * rule matched it first.
   */
  onWorkGroup(workGroupName: string, result: SimAthenaDeclaredResult): void {
    this.#rules.onTrailingKey(
      requiredRuleKey(workGroupName, "a workgroup name"),
      new SimAthenaResolvedResult(result),
    );
  }

  /**
   * The result one query is answered with.
   */
  resultFor(request: SimAthenaResultRequest): SimAthenaResolvedResult {
    return this.#rules.resultFor({
      leading: request.queryString,
      trailing: request.workGroupName,
    });
  }
}

function requiredRuleKey(key: string, described: string): string {
  if (key.length === 0) {
    throw new SimAthenaInvalidRequestException(
      `A simulated Athena result rule needs ${described} to match`,
    );
  }

  return key;
}
