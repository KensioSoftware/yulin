import type { SimWafHeader } from "../web-acl/sim-waf-custom-response.type.js";
import type { SimWafBlockedResponse } from "./sim-waf-blocked-response.js";

/**
 * What a web ACL decided about one request.
 *
 * This is what a fronting service acts on: allow the request through, adding
 * whatever headers the matching rules asked for, or answer with the blocked
 * response and never reach the origin at all.
 *
 * The counted rules are here because that is the whole point of a `Count`
 * action. A rule in count mode changes nothing about the request, so the only
 * way to know it matched is to be told, and a test staging a rule before
 * turning it on has nothing else to assert against.
 */
export interface SimWafDecision {
  readonly action: "ALLOW" | "BLOCK";

  readonly webAclName: string;
  readonly webAclArn: string;

  /**
   * The rule whose terminating action decided this, or nothing when no rule
   * matched and the web ACL's default action decided instead.
   */
  readonly terminatingRuleName: string | undefined;

  /** The rules that matched in count mode, in the order they were evaluated. */
  readonly countedRuleNames: readonly string[];

  /** The headers to add to the request before it is forwarded. */
  readonly insertedHeaders: readonly SimWafHeader[];

  /** What to answer with, when the decision was to block. */
  readonly blocked: SimWafBlockedResponse | undefined;
}
