import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimEventBridge } from "../sim-event-bridge.js";
import { SimCfnEventBusProperties } from "./bus/sim-cfn-event-bus-properties.js";
import { SimCfnEventRuleProperties } from "./rule/sim-cfn-event-rule-properties.js";

interface SimCfnEventBridgeResourceDeleterProperties {
  readonly eventBridge: SimEventBridge;
}

/**
 * Deletes the simulated EventBridge resources a CloudFormation Stack created.
 *
 * A rule needs no separate teardown for its targets, since DeleteRule takes a
 * rule's targets with it here, and deleting a bus takes its rules. A teardown
 * reaches them in dependency order anyway, so both are usually already gone by
 * the time the bus is deleted, and both commands are content to be asked twice.
 */
export class SimCfnEventBridgeResourceDeleter {
  private readonly eventBridge: SimEventBridge;

  constructor(properties: SimCfnEventBridgeResourceDeleterProperties) {
    this.eventBridge = properties.eventBridge;
  }

  /**
   * Delete one simulated EventBridge Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "EventBus": {
        await this.deleteBus(resource, properties);
        return;
      }
      case "Rule": {
        await this.deleteRule(resource, properties);
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim EventBridge CloudFormation Resource ${
            resourceTypeName
          }`,
        );
      }
    }
  }

  /**
   * Delete the bus a Resource created, and the rules that hang off it.
   */
  private async deleteBus(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    const name = new SimCfnEventBusProperties({
      resource,
      properties,
    }).name();

    await this.eventBridge.deleteEventBus({ input: { Name: name } });
  }

  /**
   * Delete the rule a Resource created, and its targets with it.
   */
  private async deleteRule(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<void> {
    const ruleProperties = new SimCfnEventRuleProperties({
      resource,
      properties,
    });

    await this.eventBridge.deleteRule({
      input: {
        Name: ruleProperties.name(),
        EventBusName: ruleProperties.busName(),
      },
    });
  }
}
