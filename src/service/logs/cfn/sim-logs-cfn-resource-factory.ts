import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimLogsLogGroup } from "../group/sim-logs-log-group.js";
import type { SimLogs } from "../sim-logs.js";
import { SimCfnLogGroupCreator } from "./group/sim-cfn-log-group-creator.js";

const logGroupResourceTypeName = "LogGroup";

interface SimLogsCfnResourceFactoryProperties {
  readonly logs: SimLogs;
}

/**
 * CloudFormation Resource factory for simulated CloudWatch Logs resources.
 *
 * AWS::Logs::LogGroup is the only Resource type here so far. The others,
 * subscription filters and metric filters most of all, need machinery this
 * simulation does not have yet.
 */
export class SimLogsCfnResourceFactory implements SimCfnServiceResourceFactory {
  readonly #logGroupCreator: SimCfnLogGroupCreator;

  constructor(properties: SimLogsCfnResourceFactoryProperties) {
    this.#logGroupCreator = new SimCfnLogGroupCreator({
      logs: properties.logs,
    });
  }

  /**
   * Create a simulated CloudWatch Logs resource from a CloudFormation
   * Resource.
   */
  create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    requireLogGroupResourceType(resourceTypeName, "");

    return Promise.resolve(
      this.#logGroupCreator.create(
        resource,
        context.resolvedProperties ?? resource.properties,
      ),
    );
  }

  /**
   * Delete a simulated CloudWatch Logs resource created from a CloudFormation
   * Resource.
   */
  delete(resourceTypeName: string, resource: SimCfnResource): Promise<void> {
    requireLogGroupResourceType(resourceTypeName, " deletion");

    const group = resource.simResource as SimLogsLogGroup | undefined;

    assertDefined(
      group,
      `sim CloudWatch Logs log group for CloudFormation Resource ${resource.logicalId}`,
    );

    this.#logGroupCreator.delete(group);

    return Promise.resolve();
  }
}

function requireLogGroupResourceType(
  resourceTypeName: string,
  operationSuffix: string,
): void {
  if (resourceTypeName !== logGroupResourceTypeName) {
    throw new Error(
      `Unsupported sim CloudWatch Logs CloudFormation Resource ` +
        `${resourceTypeName}${operationSuffix}`,
    );
  }
}
