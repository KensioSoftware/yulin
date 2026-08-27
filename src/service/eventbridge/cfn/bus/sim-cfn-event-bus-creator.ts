import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimEventBus } from "../../bus/sim-event-bus.js";
import type { SimEventBridge } from "../../sim-event-bridge.js";
import { simCfnEventBridgeResourceCreation } from "../sim-cfn-event-bridge-resource-error.js";
import { eventBusResourceType } from "../sim-cfn-event-bridge-resource-types.js";
import { SimCfnEventBusProperties } from "./sim-cfn-event-bus-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnEventBusCreatorProperties {
  readonly eventBridge: SimEventBridge;
}

/**
 * Creates simulated event buses from AWS::Events::EventBus Resources.
 *
 * The bus is created through the ordinary CreateEventBus command rather than
 * constructed directly, so a bus a template deployed is the same thing an SDK
 * caller would have got: the same name validation, and the same refusals for
 * what this simulation does not model.
 */
export class SimCfnEventBusCreator {
  private readonly eventBridge: SimEventBridge;

  constructor(properties: SimCfnEventBusCreatorProperties) {
    this.eventBridge = properties.eventBridge;
  }

  /**
   * Create an event bus from an AWS::Events::EventBus Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimEventBus> {
    const busProperties = new SimCfnEventBusProperties({
      resource,
      properties,
    });

    busProperties.refuseUnsimulated();

    const name = busProperties.name();
    const description = busProperties.description();

    return await simCfnEventBridgeResourceCreation(
      eventBusResourceType,
      resource.logicalId,
      async () => {
        await this.eventBridge.createEventBus(
          { input: { Name: name, Description: description } },
          options,
        );

        const bus = this.eventBridge.findEventBus(name);

        assertDefined(
          bus,
          `sim EventBridge bus ${name} after CloudFormation creation`,
        );

        return bus;
      },
    );
  }
}
