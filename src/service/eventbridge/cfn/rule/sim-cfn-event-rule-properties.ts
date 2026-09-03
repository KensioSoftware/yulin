import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnEventBridgeResourceError } from "../sim-cfn-event-bridge-resource-error.js";
import { eventRuleResourceType } from "../sim-cfn-event-bridge-resource-types.js";
import {
  type SimCfnEventRuleTarget,
  simCfnEventRuleTargets,
} from "./sim-cfn-event-rule-targets.js";

const maximumNameLength = 64;

/**
 * Reads AWS::Events::Rule properties into the shape PutRule and PutTargets
 * take.
 */
export class SimCfnEventRuleProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: {
    readonly resource: SimCfnResource;
    readonly properties: SimCfnTemplateValueRecord;
  }) {
    this.resource = properties.resource;
    this.properties = new Map(Object.entries(properties.properties));
  }

  /**
   * The rule name.
   *
   * An unnamed rule is named after the stack and the logical ID, as real
   * CloudFormation names one, which is why `Ref` on a rule gives back something
   * like `mystack-ScheduledRule-ABC123` rather than the logical ID.
   */
  name(): string {
    const name = this.properties.get("Name");

    if (name === undefined) {
      return new SimCfnGeneratedResourceName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
        maximumLength: maximumNameLength,
      }).value;
    }

    if (typeof name !== "string") {
      throw this.propertyError("Name must be a string");
    }

    return name;
  }

  /**
   * The bus the rule watches, which is the default bus when unnamed.
   */
  busName(): string | undefined {
    const busName = this.properties.get("EventBusName");

    if (busName === undefined) {
      return undefined;
    }

    if (typeof busName !== "string") {
      throw this.propertyError("EventBusName must be a string");
    }

    return busName;
  }

  /**
   * The event pattern, as the JSON string PutRule takes.
   *
   * A template carries the pattern as an object rather than as a string, which
   * is the one place this Resource type does not line up with the API, so it is
   * written back out here.
   */
  eventPattern(): string | undefined {
    const pattern = this.properties.get("EventPattern");

    if (pattern === undefined) {
      return undefined;
    }

    if (typeof pattern === "string") {
      return pattern;
    }

    return JSON.stringify(pattern);
  }

  /**
   * The schedule expression, for a rule that fires on a timer.
   */
  scheduleExpression(): string | undefined {
    return this.stringProperty("ScheduleExpression");
  }

  /**
   * The rule state, which simulated EventBridge validates.
   */
  state(): string | undefined {
    return this.stringProperty("State");
  }

  /**
   * The rule description.
   */
  description(): string | undefined {
    return this.stringProperty("Description");
  }

  /**
   * The rule's inline targets.
   */
  targets(): readonly SimCfnEventRuleTarget[] {
    return simCfnEventRuleTargets(this.properties.get("Targets"), (reason) =>
      this.propertyError(reason),
    );
  }

  private stringProperty(name: string): string | undefined {
    const value = this.properties.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw this.propertyError(`${name} must be a string`);
    }

    return value;
  }

  private propertyError(reason: string): Error {
    return simCfnEventBridgeResourceError(
      eventRuleResourceType,
      this.resource.logicalId,
      reason,
    );
  }
}
