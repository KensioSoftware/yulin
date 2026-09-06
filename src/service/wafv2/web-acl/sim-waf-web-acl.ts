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
import {
  type SimWafBodyInspectionResourceType,
  SimWafBodyInspectionLimits,
} from "./sim-waf-association-config.js";
import type { SimWafRule } from "./sim-waf-rule.js";
import type { SimWafWebAclRuleScope } from "./sim-waf-rule.type.js";
import { compileSimWafWebAclRules } from "./sim-waf-rules.js";
import { simWafWebAclCapacity } from "./sim-waf-web-acl-capacity.js";
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
  /**
   * The prefix every label a rule of this web ACL adds is qualified by.
   *
   * AWS writes it `awswaf:<account ID>:webacl:<web ACL name>:`, and a
   * `LabelMatchStatement` in another web ACL is written against it. Nothing
   * here prefixes a label with it, because a rule matching a label of its own
   * web ACL matches the unqualified name.
   */
  public readonly labelNamespace: string;

  readonly #scope: SimWafWebAclRuleScope;

  #configuration: SimWafWebAclConfiguration;
  #defaultAction: SimWafAction;
  #rules: readonly SimWafRule[];
  #capacity: number;
  #bodyInspectionLimits: SimWafBodyInspectionLimits;

  constructor(properties: SimWafWebAclProperties) {
    super("webacl", properties);

    this.#scope = properties;
    this.#configuration = properties.configuration;
    this.#defaultAction = readSimWafDefaultAction(properties.configuration);
    this.#rules = compileSimWafWebAclRules(
      properties.configuration,
      this.#scope,
    );
    this.#capacity = simWafWebAclCapacity(properties.configuration.rules);
    this.#bodyInspectionLimits = SimWafBodyInspectionLimits.read(
      properties.configuration.associationConfig,
    );
    this.labelNamespace =
      `awswaf:${properties.accountRegionScope.accountId}:webacl:` +
      `${properties.name}:`;
  }

  /**
   * What this web ACL's rules add up to in capacity units.
   */
  get capacity(): number {
    return this.#capacity;
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
    const bodyInspectionLimits = SimWafBodyInspectionLimits.read(
      configuration.associationConfig,
    );

    this.takeLock(lockToken);
    this.replaceDescription(configuration.description);
    this.#configuration = configuration;
    this.#defaultAction = defaultAction;
    this.#rules = rules;
    this.#capacity = simWafWebAclCapacity(configuration.rules);
    this.#bodyInspectionLimits = bodyInspectionLimits;
  }

  /**
   * How many bytes of a request body this web ACL reads in front of one
   * resource type.
   *
   * `AssociationConfig` raises it per resource type, and a web ACL written
   * without one reads the 16 KB default everything it protects has.
   */
  bodyInspectionLimitBytes(
    resourceType: SimWafBodyInspectionResourceType | undefined,
  ): number {
    return this.#bodyInspectionLimits.bytesFor(resourceType);
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
