import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";

/**
 * What a rule found when it read the request field it inspects.
 *
 * Most reads answer with the strings to match against, which is `inspect`. The
 * other two are what oversize content means: WAF stops reading a field at a
 * fixed size, and the rule says whether content it could not read counts as a
 * match or not.
 */
export type SimWafFieldContent =
  | { readonly outcome: "inspect"; readonly candidates: readonly string[] }
  | { readonly outcome: "match" }
  | { readonly outcome: "noMatch" };

/**
 * How much of a request body, header set or cookie set WAF reads.
 *
 * Real WAF stops at 8 KB for a web ACL as it is created here. A CloudFront
 * association can raise the body limit, which is settled where associations
 * are, so this is the one figure until then.
 */
export const simWafInspectionLimitBytes = 8192;

/**
 * What a rule does about content too large for WAF to read.
 */
export type SimWafOversizeHandling = "CONTINUE" | "MATCH" | "NO_MATCH";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Read the oversize handling a rule named, refusing anything else.
 */
export function requiredSimWafOversizeHandling(
  handling: string | undefined,
  ruleName: string,
): SimWafOversizeHandling {
  const wanted = handling ?? "CONTINUE";

  if (wanted !== "CONTINUE" && wanted !== "MATCH" && wanted !== "NO_MATCH") {
    invalidSimWafRule(
      ruleName,
      `The oversize handling ${String(handling)} is not valid`,
    );
  }

  return wanted;
}

/**
 * Decide what a rule inspects, given everything the field held.
 *
 * Content within the limit is inspected whole. Past it, `MATCH` and `NO_MATCH`
 * settle the statement without looking, and `CONTINUE` inspects as much as WAF
 * would have read: whole entries while they fit, and the first entry cut to
 * the limit when even one does not.
 */
export function simWafFieldContent(
  candidates: readonly string[],
  oversizeHandling: SimWafOversizeHandling,
): SimWafFieldContent {
  const encoded = candidates.map((candidate) => encoder.encode(candidate));
  const total = encoded.reduce((sum, bytes) => sum + bytes.length, 0);

  if (total <= simWafInspectionLimitBytes) {
    return { outcome: "inspect", candidates };
  }

  if (oversizeHandling !== "CONTINUE") {
    return { outcome: oversizeHandling === "MATCH" ? "match" : "noMatch" };
  }

  return { outcome: "inspect", candidates: readWithinLimit(encoded) };
}

/**
 * The content WAF would have read before it stopped.
 */
function readWithinLimit(encoded: readonly Uint8Array[]): readonly string[] {
  const read: string[] = [];
  let budget = simWafInspectionLimitBytes;

  for (const bytes of encoded) {
    if (bytes.length > budget) {
      // An entry over the remaining budget is cut where WAF stopped reading,
      // which for a body is the only case that happens.
      read.push(decoder.decode(bytes.subarray(0, budget)));
      break;
    }

    read.push(decoder.decode(bytes));
    budget -= bytes.length;
  }

  return read;
}
