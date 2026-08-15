import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";

/**
 * How long an ECS cluster name may be.
 */
const maximumNameLength = 255;

interface SimCfnEcsClusterNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
}

/**
 * The name CloudFormation gives a cluster whose template does not name it.
 *
 * A cluster name is at most 255 characters, so a long stack name and logical ID
 * together are trimmed to fit, the same way every other service's generated
 * name is.
 */
export class SimCfnEcsClusterName {
  private readonly generated: SimCfnGeneratedResourceName;

  constructor(properties: SimCfnEcsClusterNameProperties) {
    this.generated = new SimCfnGeneratedResourceName({
      stackName: properties.stackName,
      logicalId: properties.logicalId,
      maximumLength: maximumNameLength,
    });
  }

  /**
   * The generated cluster name.
   */
  get value(): string {
    return this.generated.value;
  }
}
