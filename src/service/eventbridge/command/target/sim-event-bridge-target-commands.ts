import { SimEventTargetArn } from "../../target/sim-event-target-arn.js";
import type { SimEventTargetStore } from "../../target/sim-event-target-store.js";
import type { SimEventRuleStore } from "../../rule/sim-event-rule-store.js";
import { SimEventBridgePage } from "../sim-event-bridge-page.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";
import type { SimEventBridgeRuleAccess } from "../rule/sim-event-bridge-rule-access.js";
import type {
  SimEventBridgeTarget,
  SimListRuleNamesByTargetCommand,
  SimListRuleNamesByTargetCommandOutput,
  SimListTargetsByRuleCommand,
  SimListTargetsByRuleCommandOutput,
  SimRemoveTargetsCommand,
  SimRemoveTargetsCommandOutput,
} from "./target.command.js";

interface SimEventBridgeTargetCommandsProperties {
  readonly rules: SimEventRuleStore;
  readonly targets: SimEventTargetStore;
  readonly access: SimEventBridgeRuleAccess;
}

/**
 * The commands that remove and list a rule's targets.
 *
 * Adding them is its own handler, since PutTargets is the only one of these
 * with request input to validate and resources to build.
 *
 * A rule request names the rule and its bus, so all of these go through the
 * same rule access as the rule commands, and authorize against the rule's own
 * ARN.
 */
export class SimEventBridgeTargetCommands {
  private readonly rules: SimEventRuleStore;
  private readonly targets: SimEventTargetStore;
  private readonly access: SimEventBridgeRuleAccess;

  constructor(properties: SimEventBridgeTargetCommandsProperties) {
    this.rules = properties.rules;
    this.targets = properties.targets;
    this.access = properties.access;
  }

  /**
   * Remove targets from a rule by id.
   *
   * An id the rule does not have comes back as a failed entry rather than
   * failing the request, which is what real EventBridge does.
   */
  removeTargets(
    command: SimRemoveTargetsCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimRemoveTargetsCommandOutput {
    const input = command.input;
    const rule = this.access.require(
      "events:RemoveTargets",
      { Name: input.Rule, EventBusName: input.EventBusName },
      options,
    );
    const missing = this.targets.remove(
      rule.busName.value,
      rule.name.value,
      input.Ids ?? [],
    );

    return {
      $metadata: {},
      FailedEntryCount: missing.length,
      FailedEntries: missing.map((id) => ({
        TargetId: id,
        ErrorCode: "ResourceNotFoundException",
        ErrorMessage:
          `Rule ${rule.name.value} does not have a target with ` +
          `the id ${id}.`,
      })),
    };
  }

  /**
   * List the targets of a rule, in the order they were added.
   */
  listTargetsByRule(
    command: SimListTargetsByRuleCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimListTargetsByRuleCommandOutput {
    const input = command.input;
    const rule = this.access.require(
      "events:ListTargetsByRule",
      { Name: input.Rule, EventBusName: input.EventBusName },
      options,
    );
    const listed: readonly SimEventBridgeTarget[] = this.targets
      .forRule(rule.busName.value, rule.name.value)
      .map((target) => ({
        Id: target.id,
        Arn: target.arn.value,
        Input: target.input,
      }));
    const page = new SimEventBridgePage(listed, input.Limit, input.NextToken);

    return {
      $metadata: {},
      Targets: page.items,
      NextToken: page.nextToken,
    };
  }

  /**
   * List the rules of a bus that send events to one target.
   */
  listRuleNamesByTarget(
    command: SimListRuleNamesByTargetCommand,
    options?: SimEventBridgeRequestOptions,
  ): SimListRuleNamesByTargetCommandOutput {
    const input = command.input;
    const busName = this.access.listedBusName(
      "events:ListRuleNamesByTarget",
      input.EventBusName,
      options,
    );
    const targetArn = SimEventTargetArn.of(input.TargetArn);
    const sending = this.targets.rulesSendingTo(
      this.rules.forBus(busName),
      targetArn.value,
    );
    const page = new SimEventBridgePage(
      sending.map((rule) => rule.name.value),
      input.Limit,
      input.NextToken,
    );

    return {
      $metadata: {},
      RuleNames: page.items,
      NextToken: page.nextToken,
    };
  }
}
