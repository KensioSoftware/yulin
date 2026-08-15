import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimEcsEphemeralStorage,
  SimEcsProxyConfiguration,
  SimEcsRuntimePlatform,
  SimEcsTaskDefinitionPlacementConstraint,
  SimEcsVolume,
} from "../../task-definition/sim-ecs-task-definition-parts.js";
import type { SimEcsTaskDefinitionSettingsType } from "../../task-definition/sim-ecs-task-definition-settings.js";
import type { SimCfnEcsPropertyReader } from "../property/sim-cfn-ecs-property-reader.js";
import { simCfnEcsRoleArn } from "./sim-cfn-ecs-role-arn.js";

interface SimCfnEcsTaskDefinitionSettingsProperties {
  readonly resource: SimCfnResource;
  readonly reader: SimCfnEcsPropertyReader;
}

/**
 * Reads what an AWS::ECS::TaskDefinition declares besides its containers.
 *
 * These are the settings a registered revision holds, so they are translated
 * and passed on rather than acted on. The two Roles are the exception: a
 * running task uses them, and a template can name either of them by `Ref` to a
 * Role of the same stack, so both go through the ARN resolution that turns a
 * Role name into the ARN it would have.
 */
export class SimCfnEcsTaskDefinitionSettings {
  private readonly resource: SimCfnResource;
  private readonly reader: SimCfnEcsPropertyReader;

  constructor(properties: SimCfnEcsTaskDefinitionSettingsProperties) {
    this.resource = properties.resource;
    this.reader = properties.reader;
  }

  /**
   * The settings this Resource declares, as RegisterTaskDefinition takes them.
   */
  declared(): SimEcsTaskDefinitionSettingsType {
    const reader = this.reader;

    return {
      taskRoleArn: this.roleArn("TaskRoleArn"),
      executionRoleArn: this.roleArn("ExecutionRoleArn"),
      networkMode: reader.text("NetworkMode"),
      cpu: reader.text("Cpu"),
      memory: reader.text("Memory"),
      pidMode: reader.text("PidMode"),
      ipcMode: reader.text("IpcMode"),
      requiresCompatibilities: reader.textList("RequiresCompatibilities"),
      volumes: reader.apiList<SimEcsVolume>("Volumes"),
      placementConstraints:
        reader.apiList<SimEcsTaskDefinitionPlacementConstraint>(
          "PlacementConstraints",
        ),
      runtimePlatform:
        reader.apiRecord<SimEcsRuntimePlatform>("RuntimePlatform"),
      ephemeralStorage:
        reader.apiRecord<SimEcsEphemeralStorage>("EphemeralStorage"),
      proxyConfiguration:
        reader.apiRecord<SimEcsProxyConfiguration>("ProxyConfiguration"),
    };
  }

  private roleArn(name: string): string | undefined {
    return simCfnEcsRoleArn(this.resource, this.reader.text(name));
  }
}
