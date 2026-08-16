import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudWatchAlarm } from "../alarm/sim-cloudwatch-alarm.js";
import type { SimCloudWatch } from "../sim-cloudwatch.js";
import { SimCfnAlarmCreator } from "./alarm/sim-cfn-alarm-creator.js";

const alarmResourceTypeName = "Alarm";

interface SimCloudWatchCfnResourceFactoryProperties {
  readonly cloudWatch: SimCloudWatch;
}

/**
 * CloudFormation Resource factory for simulated CloudWatch resources.
 *
 * AWS::CloudWatch::Alarm is the only Resource type here. A composite alarm
 * watches other alarms, an anomaly detector needs a trained model, and a
 * dashboard is a picture nothing in a test can read, so none of the three has
 * anything to be here yet.
 */
export class SimCloudWatchCfnResourceFactory implements SimCfnServiceResourceFactory {
  readonly #alarmCreator: SimCfnAlarmCreator;

  constructor(properties: SimCloudWatchCfnResourceFactoryProperties) {
    this.#alarmCreator = new SimCfnAlarmCreator({
      cloudWatch: properties.cloudWatch,
    });
  }

  /**
   * Create a simulated CloudWatch resource from a CloudFormation Resource.
   */
  create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    requireAlarmResourceType(resourceTypeName, "");

    return this.#alarmCreator.create(
      resource,
      context.resolvedProperties ?? resource.properties,
    );
  }

  /**
   * Delete a simulated CloudWatch resource created from a CloudFormation
   * Resource.
   */
  delete(resourceTypeName: string, resource: SimCfnResource): Promise<void> {
    requireAlarmResourceType(resourceTypeName, " deletion");

    const alarm = resource.simResource as SimCloudWatchAlarm | undefined;

    assertDefined(
      alarm,
      `sim CloudWatch alarm for CloudFormation Resource ${resource.logicalId}`,
    );

    return this.#alarmCreator.delete(alarm);
  }
}

function requireAlarmResourceType(
  resourceTypeName: string,
  operationSuffix: string,
): void {
  if (resourceTypeName !== alarmResourceTypeName) {
    throw new Error(
      `Unsupported sim CloudWatch CloudFormation Resource ` +
        `${resourceTypeName}${operationSuffix}`,
    );
  }
}
