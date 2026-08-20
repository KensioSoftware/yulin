import type { SimWafDecision } from "../evaluate/sim-waf-decision.js";
import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import type { SimWafRegexPatternSet } from "../regex-pattern-set/sim-waf-regex-pattern-set.js";
import {
  SimWafResource,
  type SimWafResourceProperties,
} from "../resource/sim-waf-resource.js";
import type { SimWafResourceStore } from "../resource/sim-waf-resource-store.js";
import type { SimWafAction } from "./sim-waf-action.js";
import type { SimWafHeader } from "./sim-waf-custom-response.type.js";
import type { SimWafRule } from "./sim-waf-rule.js";
import { compileSimWafRules } from "./sim-waf-rules.js";
import {
  readSimWafDefaultAction,
  type SimWafWebAclConfiguration,
} from "./sim-waf-web-acl-configuration.js";

interface SimWafWebAclProperties extends SimWafResourceProperties {
  readonly configuration: SimWafWebAclConfiguration;
  readonly regexPatternSets: SimWafResourceStore<SimWafRegexPatternSet>;
}

/**
 * One web ACL: an ordered list of rules and what to do with a request none of
 * them claims.
 *
 * Evaluating is the whole of what a web ACL is for, and it happens in
 * ascending rule priority. The first rule that matches and carries a
 * terminating action decides the request; a `Count` action records the match
 * and lets the next rule have a look. A request no rule terminates gets the
 * default action.
 */
export class SimWafWebAcl extends SimWafResource {
  readonly #regexPatternSets: SimWafResourceStore<SimWafRegexPatternSet>;

  #configuration: SimWafWebAclConfiguration;
  #defaultAction: SimWafAction;
  #rules: readonly SimWafRule[];

  constructor(properties: SimWafWebAclProperties) {
    super("webacl", properties);

    this.#regexPatternSets = properties.regexPatternSets;
    this.#configuration = properties.configuration;
    this.#defaultAction = readSimWafDefaultAction(properties.configuration);
    this.#rules = this.compileRules(properties.configuration);
  }

  /**
   * What this web ACL was last written with, as the API reports it.
   */
  get configuration(): SimWafWebAclConfiguration {
    return this.#configuration;
  }

  /**
   * Write a new configuration over this one.
   *
   * The rules are compiled before anything is replaced, so a web ACL that
   * refuses an update keeps the rules it had rather than being left with none.
   */
  reconfigure(
    configuration: SimWafWebAclConfiguration,
    lockToken: string | undefined,
  ): void {
    const defaultAction = readSimWafDefaultAction(configuration);
    const rules = this.compileRules(configuration);

    this.takeLock(lockToken);
    this.replaceDescription(configuration.description);
    this.#configuration = configuration;
    this.#defaultAction = defaultAction;
    this.#rules = rules;
  }

  /**
   * Decide what happens to one request.
   */
  evaluate(request: SimWafInspectedRequest): SimWafDecision {
    const counted: string[] = [];
    const inserted: SimWafHeader[] = [];

    for (const rule of this.#rules) {
      if (!rule.matches(request)) {
        continue;
      }

      inserted.push(...rule.action.insertHeaders);

      if (rule.action.isTerminating) {
        return this.decision(rule.action, rule.name, counted, inserted);
      }

      counted.push(rule.name);
    }

    return this.decision(this.#defaultAction, undefined, counted, inserted);
  }

  private decision(
    action: SimWafAction,
    terminatingRuleName: string | undefined,
    countedRuleNames: readonly string[],
    insertedHeaders: readonly SimWafHeader[],
  ): SimWafDecision {
    const blocking = action.kind === "BLOCK";

    return {
      action: blocking ? "BLOCK" : "ALLOW",
      webAclName: this.name,
      webAclArn: this.arn,
      terminatingRuleName,
      countedRuleNames,
      // Nothing is forwarded when the request is blocked, so there is nothing
      // for a rule's inserted headers to be added to.
      insertedHeaders: blocking ? [] : insertedHeaders,
      blocked: action.blocked,
    };
  }

  private compileRules(
    configuration: SimWafWebAclConfiguration,
  ): readonly SimWafRule[] {
    return compileSimWafRules(configuration.rules, {
      regexPatternSets: this.#regexPatternSets,
      customResponseBodies: configuration.customResponseBodies ?? {},
    });
  }
}
