import type { SimEventRuleStore } from "../../rule/sim-event-rule-store.js";
import { SimEventRuleState } from "../../rule/sim-event-rule-state.js";
import { SimEventBridgePage } from "../sim-event-bridge-page.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import { listedRule, listedRules } from "./sim-event-bridge-listed-rule.js";
import type { SimEventBridgeRuleAccess } from "./sim-event-bridge-rule-access.js";
import type {
  SimDeleteRuleCommand,
  SimDeleteRuleCommandOutput,
  SimDescribeRuleCommand,
  SimDescribeRuleCommandOutput,
  SimDisableRuleCommand,
  SimDisableRuleCommandOutput,
  SimEnableRuleCommand,
  SimEnableRuleCommandOutput,
  SimListRulesCommand,
  SimListRulesCommandOutput,
} from "./rule.command.js";

interface SimEventBridgeRuleCommandsProperties {
  readonly rules: SimEventRuleStore;
  readonly access: SimEventBridgeRuleAccess;
}

/**
 * The commands that read, delete and switch rules on and off.
 *
 * Creating one is its own handler, since PutRule is the only one of these with
 * an event pattern to read and a resource to build.
 */
export class SimEventBridgeRuleCommands {
  private readonly rules: SimEventRuleStore;
  private readonly access: SimEventBridgeRuleAccess;

  constructor(properties: SimEventBridgeRuleCommandsProperties) {
    this.rules = properties.rules;
    this.access = properties.access;
  }

  /**
   * Delete a rule.
   *
   * Deleting a rule that is not there succeeds, as real EventBridge documents
   * no not-found error for it.
   */
  deleteRule(
    command: SimDeleteRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimDeleteRuleCommandOutput {
    const rule = this.access.find("events:DeleteRule", command.input, options);

    if (rule !== undefined) {
      this.rules.remove(rule);
    }

    return { $metadata: {} };
  }

  /**
   * Describe a rule.
   */
  describeRule(
    command: SimDescribeRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimDescribeRuleCommandOutput {
    const rule = this.access.require(
      "events:DescribeRule",
      command.input,
      options,
    );

    return { $metadata: {}, ...listedRule(rule) };
  }

  /**
   * List the rules on one bus, in creation order.
   */
  listRules(
    command: SimListRulesCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimListRulesCommandOutput {
    const input = command.input;
    const busName = this.access.listedBusName(
      "events:ListRules",
      input.EventBusName,
      options,
    );
    const page = new SimEventBridgePage(
      listedRules(this.rules.forBus(busName), input.NamePrefix),
      input.Limit,
      input.NextToken,
    );

    return {
      $metadata: {},
      Rules: page.items,
      NextToken: page.nextToken,
    };
  }

  /**
   * Start a rule matching events again.
   */
  enableRule(
    command: SimEnableRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimEnableRuleCommandOutput {
    this.access
      .require("events:EnableRule", command.input, options)
      .setState(SimEventRuleState.default());

    return { $metadata: {} };
  }

  /**
   * Stop a rule matching events.
   *
   * A disabled rule matches nothing while it is off, and picks up from the
   * next event when it goes back on rather than replaying what it missed.
   */
  disableRule(
    command: SimDisableRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimDisableRuleCommandOutput {
    this.access
      .require("events:DisableRule", command.input, options)
      .setState(SimEventRuleState.disabled());

    return { $metadata: {} };
  }
}
