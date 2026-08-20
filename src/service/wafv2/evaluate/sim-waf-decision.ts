import type { SimWafAction } from "../web-acl/sim-waf-action.js";
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

  /**
   * The labels the rules that matched added to the request, in the order they
   * were added.
   *
   * A managed rule group adds one for every rule of its own that matched, so
   * this is what says which rule inside a group claimed the request. The rule
   * that decided is the web ACL's own rule, and the group it names holds
   * dozens.
   */
  readonly labels: readonly string[];

  /** The headers to add to the request before it is forwarded. */
  readonly insertedHeaders: readonly SimWafHeader[];

  /** What to answer with, when the decision was to block. */
  readonly blocked: SimWafBlockedResponse | undefined;
}

/**
 * What a web ACL knows when it has finished evaluating a request.
 */
export interface SimWafDecisionProperties {
  readonly action: SimWafAction;
  readonly webAclName: string;
  readonly webAclArn: string;
  readonly terminatingRuleName: string | undefined;
  readonly countedRuleNames: readonly string[];
  readonly insertedHeaders: readonly SimWafHeader[];
  readonly labels: readonly string[];
}

/**
 * Turn what a web ACL worked out into the decision it answers with.
 */
export function simWafDecision(
  properties: SimWafDecisionProperties,
): SimWafDecision {
  const { action } = properties;
  const blocking = action.kind === "BLOCK";

  return {
    ...properties,
    action: blocking ? "BLOCK" : "ALLOW",
    // Nothing is forwarded when the request is blocked, so there is nothing
    // for a rule's inserted headers to be added to.
    insertedHeaders: blocking ? [] : properties.insertedHeaders,
    blocked: action.blocked,
  };
}
