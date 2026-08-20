import {
  simWafDecision,
  type SimWafDecision,
} from "../evaluate/sim-waf-decision.js";
import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import { simWafEvaluateRules } from "../evaluate/sim-waf-evaluate-rules.js";
import {
  SimWafResource,
  type SimWafResourceProperties,
} from "../resource/sim-waf-resource.js";
import type { SimWafAction } from "./sim-waf-action.js";
import type { SimWafRule } from "./sim-waf-rule.js";
import type { SimWafWebAclRuleScope } from "./sim-waf-rule.type.js";
import { compileSimWafWebAclRules } from "./sim-waf-rules.js";
import {
  readSimWafDefaultAction,
  type SimWafWebAclConfiguration,
} from "./sim-waf-web-acl-configuration.js";

interface SimWafWebAclProperties
  extends SimWafResourceProperties, SimWafWebAclRuleScope {
  readonly configuration: SimWafWebAclConfiguration;
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
  readonly #scope: SimWafWebAclRuleScope;

  #configuration: SimWafWebAclConfiguration;
  #defaultAction: SimWafAction;
  #rules: readonly SimWafRule[];

  constructor(properties: SimWafWebAclProperties) {
    super("webacl", properties);

    this.#scope = properties;
    this.#configuration = properties.configuration;
    this.#defaultAction = readSimWafDefaultAction(properties.configuration);
    this.#rules = compileSimWafWebAclRules(
      properties.configuration,
      this.#scope,
    );
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
    const rules = compileSimWafWebAclRules(configuration, this.#scope);

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
    const outcome = simWafEvaluateRules(this.#rules, request);

    return simWafDecision({
      ...outcome,
      action: outcome.action ?? this.#defaultAction,
      webAclName: this.name,
      webAclArn: this.arn,
      labels: request.labels.all(),
    });
  }
}
