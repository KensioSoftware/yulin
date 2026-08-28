import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimEventBridge } from "../sim-event-bridge.js";
import { SimCfnEventBusCreator } from "./bus/sim-cfn-event-bus-creator.js";
import { SimCfnEventRuleCreator } from "./rule/sim-cfn-event-rule-creator.js";
import { SimCfnEventBridgeResourceDeleter } from "./sim-cfn-event-bridge-resource-deleter.js";

interface SimEventBridgeCfnResourceFactoryProperties {
  readonly eventBridge: SimEventBridge;
}

/**
 * CloudFormation Resource factory for simulated EventBridge resources.
 */
export class SimEventBridgeCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly busCreator: SimCfnEventBusCreator;
  private readonly ruleCreator: SimCfnEventRuleCreator;
  private readonly deleter: SimCfnEventBridgeResourceDeleter;

  constructor(properties: SimEventBridgeCfnResourceFactoryProperties) {
    this.busCreator = new SimCfnEventBusCreator({
      eventBridge: properties.eventBridge,
    });
    this.ruleCreator = new SimCfnEventRuleCreator({
      eventBridge: properties.eventBridge,
    });
    this.deleter = new SimCfnEventBridgeResourceDeleter({
      eventBridge: properties.eventBridge,
    });
  }

  /**
   * Create a simulated EventBridge resource from a CloudFormation Resource.
   *
   * The bus and the rule are the AWS::Events::* Resource types this simulation
   * models. Anything else is reported as unsupported and skipped rather than
   * quietly treated as deployed.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;

    const options = simCfnResourceCallerOptions(context.caller);

    switch (resourceTypeName) {
      case "EventBus": {
        return await this.busCreator.create(resource, properties, options);
      }
      case "Rule": {
        return await this.ruleCreator.create(resource, properties, options);
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
   * Delete a simulated EventBridge resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.deleter.delete(
      resourceTypeName,
      resource,
      context.resolvedProperties ?? resource.properties,
      simCfnResourceCallerOptions(context.caller),
    );
  }
}
