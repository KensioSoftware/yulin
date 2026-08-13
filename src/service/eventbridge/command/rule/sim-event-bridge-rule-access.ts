import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimEventBusName } from "../../bus/sim-event-bus-name.js";
import type { SimEventRule } from "../../rule/sim-event-rule.js";
import { eventRuleArn } from "../../rule/sim-event-rule-arn.js";
import { SimEventRuleName } from "../../rule/sim-event-rule-name.js";
import type { SimEventRuleStore } from "../../rule/sim-event-rule-store.js";
import type { SimEventBridgeAuthorizer } from "../authorize/sim-event-bridge-authorizer.js";
import type { SimEventBridgeBusAccess } from "../bus/sim-event-bridge-bus-access.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";

/**
 * Which rule a request names, on which bus.
 */
export interface SimEventBridgeRequestedRule {
  readonly name: SimEventRuleName;
  readonly busName: SimEventBusName;
}

interface SimEventBridgeRuleAccessProperties {
  readonly rules: SimEventRuleStore;
  readonly buses: SimEventBridgeBusAccess;
  readonly authorizer: SimEventBridgeAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

interface SimEventBridgeRuleRequest {
  readonly Name?: string | undefined;
  readonly EventBusName?: string | undefined;
}

/**
 * How a request reaches the rule it names.
 *
 * A rule request names a rule and, optionally, the bus it is on, so both are
 * read here. Authorization is against the rule's own ARN rather than the bus's,
 * which is what lets a policy allow changes to one rule and not another.
 *
 * The caller is authorized before the rule is looked up, as everywhere else in
 * this service, so a caller with no permission is refused whether or not the
 * rule is there.
 */
export class SimEventBridgeRuleAccess {
  private readonly rules: SimEventRuleStore;
  private readonly buses: SimEventBridgeBusAccess;
  private readonly authorizer: SimEventBridgeAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimEventBridgeRuleAccessProperties) {
    this.rules = properties.rules;
    this.buses = properties.buses;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Read the rule and bus a request names.
   */
  requested(request: SimEventBridgeRuleRequest): SimEventBridgeRequestedRule {
    return {
      name: SimEventRuleName.required(request.Name),
      busName: this.buses.requestedName(request.EventBusName),
    };
  }

  /**
   * Ensure the caller may perform an action on a rule, which need not exist.
   */
  authorize(
    action: string,
    requested: SimEventBridgeRequestedRule,
    options?: SimEventBridgeRequestOptions,
  ): void {
    this.authorizer.authorizeBus(action, this.arnFor(requested), options);
  }

  /**
   * Resolve the rule a request names, authorizing the action first.
   */
  require(
    action: string,
    request: SimEventBridgeRuleRequest,
    options?: SimEventBridgeRequestOptions,
  ): SimEventRule {
    const requested = this.requested(request);

    this.authorize(action, requested, options);

    return this.rules.require(requested.busName.value, requested.name.value);
  }

  /**
   * Resolve the rule a request names, or nothing when there is none.
   *
   * This is what DeleteRule needs. Real EventBridge documents no not-found
   * error for it, so deleting a rule that is not there succeeds.
   */
  find(
    action: string,
    request: SimEventBridgeRuleRequest,
    options?: SimEventBridgeRequestOptions,
  ): SimEventRule | undefined {
    const requested = this.requested(request);

    this.authorize(action, requested, options);

    return this.rules.find(requested.busName.value, requested.name.value);
  }

  /**
   * The bus a listing of rules is for, once the caller may list them.
   *
   * Real EventBridge gives ListRules no rule-level permission, so it
   * authorizes against every rule in the Account and Region rather than
   * against the bus named, and does not filter the listing by what the caller
   * can reach.
   */
  listedBusName(
    action: string,
    requested: string | undefined,
    options?: SimEventBridgeRequestOptions,
  ): string {
    this.authorizer.authorizeAnyBus(action, options);

    return this.buses.requestedName(requested).value;
  }

  /**
   * The ARN a rule of this name on this bus has, or would have.
   */
  private arnFor(requested: SimEventBridgeRequestedRule): string {
    return eventRuleArn(
      requested.name.value,
      requested.busName,
      this.accountRegionScope,
    );
  }
}
