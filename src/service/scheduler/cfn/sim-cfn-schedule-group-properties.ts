import { SimCfnGeneratedResourceName } from "../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  schedulerScheduleGroupResourceType,
  simCfnSchedulerResourceError,
} from "./sim-cfn-scheduler-resource-error.js";

const maximumNameLength = 64;

/**
 * The properties an AWS::Scheduler::ScheduleGroup Resource is read for.
 */
const readNames = new Set(["Name", "Tags"]);

/**
 * Why a group is deployed without its tags, rather than the tags failing it.
 *
 * Every other unmodelled Scheduler input is refused, and this one is not, for
 * two reasons. Nothing a simulation runs reads a schedule group tag, so a group
 * without them behaves exactly as the template's does. And the CDK propagates a
 * Stack's tags onto every taggable Resource in it, so refusing them would fail
 * any tagged Stack that happened to contain a group, over a property nobody
 * writing that Stack asked the group for.
 */
const tagsReason =
  "Tags is a real AWS::Scheduler::ScheduleGroup property no simulated " +
  "service reads, so the group is created without them";

/**
 * Reads AWS::Scheduler::ScheduleGroup properties.
 *
 * A group is a name, which is the whole of the Resource beyond its tags.
 */
export class SimCfnScheduleGroupProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: {
    readonly resource: SimCfnResource;
    readonly properties: SimCfnTemplateValueRecord;
  }) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * The group name.
   *
   * An unnamed group is named after the stack and the logical ID, as real
   * CloudFormation names one.
   */
  name(): string {
    const name = this.properties["Name"];

    if (name === undefined) {
      return new SimCfnGeneratedResourceName({
        stackName: this.resource.stackName,
        logicalId: this.resource.logicalId,
        maximumLength: maximumNameLength,
      }).value;
    }

    if (typeof name !== "string") {
      throw simCfnSchedulerResourceError(
        schedulerScheduleGroupResourceType,
        this.resource.logicalId,
        "Name must be a string",
      );
    }

    return name;
  }

  /**
   * Record the properties the group is created without acting on.
   */
  recordIgnoredProperties(): void {
    for (const name of Object.keys(this.properties)) {
      if (name === "Tags") {
        this.resource.ignoreProperty(name, tagsReason);

        continue;
      }

      if (!readNames.has(name)) {
        this.resource.ignoreProperty(
          name,
          `${name} is not an ${schedulerScheduleGroupResourceType} property ` +
            `simulated Scheduler knows about, so the group is created ` +
            `without it`,
        );
      }
    }
  }
}
