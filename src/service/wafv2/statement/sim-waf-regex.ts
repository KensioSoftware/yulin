/**
 * Compile one WAFv2 regular expression, or answer with nothing when it will
 * not compile.
 *
 * WAF matches without anchoring, so a pattern claims a value when it is found
 * anywhere in it, and matching is case sensitive unless the rule asked for a
 * LOWERCASE transformation.
 *
 * The pattern is compiled without the unicode flag. WAF's own dialect is a
 * subset of PCRE, and a pattern written for it can hold escapes that a unicode
 * mode expression rejects outright, so the looser mode is the one that accepts
 * what AWS accepts.
 */
export function simWafRegExp(pattern: string): RegExp | undefined {
  try {
    /*
     * The pattern comes from whoever wrote the web ACL, never from a request,
     * so a pattern that backtracks badly holds up that author's own test run
     * and nothing else. Real WAF bounds the expression instead, at 200
     * characters and its own capacity units.
     */
    // oxlint-disable-next-line security/detect-non-literal-regexp
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
}
