import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnEventBridgeResourceError } from "../sim-cfn-event-bridge-resource-error.js";
import { eventBusResourceType } from "../sim-cfn-event-bridge-resource-types.js";
import { simCfnEventBridgeTags } from "../sim-cfn-event-bridge-tags.js";
import type { SimEventBridgeTag } from "../../command/bus/bus.command.js";

/**
 * What a template can say about an event bus that this simulation does not
 * model, and what each would have done.
 *
 * Each is refused rather than dropped, because a bus deployed without one looks
 * configured to the template that wrote it and behaves as though it were not: a
 * dead letter queue that is never written to is worse than one that was
 * refused, and a `Policy` silently missing is a bus that admits nobody while
 * the template says it admits an Account.
 */
const unsimulatedProperties: readonly (readonly [string, string])[] = [
  ["Policy", "event bus resource policies are not simulated"],
  [
    "DeadLetterConfig",
    "an undeliverable event is recorded rather than sent on",
  ],
  ["KmsKeyIdentifier", "events are not encrypted with a customer managed key"],
  ["LogConfig", "event bus logging is not simulated"],
];

interface SimCfnEventBusPropertiesProperties {
  readonly resource: SimCfnResource;
  readonly properties: SimCfnTemplateValueRecord;
}

/**
 * Reads AWS::Events::EventBus properties into the shape CreateEventBus takes.
 */
export class SimCfnEventBusProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: SimCfnEventBusPropertiesProperties) {
    this.resource = properties.resource;
    this.properties = new Map(Object.entries(properties.properties));
  }

  /**
   * The bus name, which AWS requires on this Resource type.
   *
   * Unlike most named resources there is no generated fallback, because
   * CloudFormation does not generate one either: `Name` is a required property
   * of an `AWS::Events::EventBus`.
   */
  name(): string {
    const name = this.properties.get("Name");

    if (typeof name !== "string" || name === "") {
      throw this.propertyError("Name is required, and is a string");
    }

    return name;
  }

  /**
   * The bus description, which a template may leave out.
   */
  description(): string | undefined {
    const description = this.properties.get("Description");

    if (description === undefined) {
      return undefined;
    }

    if (typeof description !== "string") {
      throw this.propertyError("Description must be a string");
    }

    return description;
  }

  /**
   * The partner event source a partner event bus is matched with, which a
   * custom bus leaves out.
   */
  eventSourceName(): string | undefined {
    const eventSourceName = this.properties.get("EventSourceName");

    if (eventSourceName === undefined) {
      return undefined;
    }

    if (typeof eventSourceName !== "string") {
      throw this.propertyError("EventSourceName must be a string");
    }

    return eventSourceName;
  }

  /**
   * Refuse what this simulation does not model, naming the property.
   */
  refuseUnsimulated(): void {
    for (const [property, reason] of unsimulatedProperties) {
      // Asked by key rather than by value, so a template writing `null` for
      // one of these is refused rather than read as having left it out.
      if (this.properties.has(property)) {
        throw this.propertyError(
          `${property} is not simulated, so the Resource is refused rather ` +
            `than deployed without it: ${reason}`,
        );
      }
    }
  }

  /**
   * The tags the bus is created with.
   */
  tags(): SimEventBridgeTag[] | undefined {
    return simCfnEventBridgeTags(this.properties.get("Tags"));
  }

  private propertyError(reason: string): Error {
    return simCfnEventBridgeResourceError(
      eventBusResourceType,
      this.resource.logicalId,
      reason,
    );
  }
}
