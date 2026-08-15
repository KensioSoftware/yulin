import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";

/**
 * How long an ECS service name may be.
 */
const maximumNameLength = 255;

interface SimCfnEcsServiceNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
}

/**
 * The name CloudFormation gives a service whose template does not name it.
 *
 * Real CloudFormation composes it from the stack name, the logical ID and a
 * random part, which is why a template leaving `ServiceName` out is a template
 * whose service nothing can predict. The random part is left out here so a
 * test can name the service it got, the same way a generated cluster name and
 * task definition family are composed.
 */
export class SimCfnEcsServiceName {
  private readonly generated: SimCfnGeneratedResourceName;

  constructor(properties: SimCfnEcsServiceNameProperties) {
    this.generated = new SimCfnGeneratedResourceName({
      stackName: properties.stackName,
      logicalId: properties.logicalId,
      maximumLength: maximumNameLength,
    });
  }

  /**
   * The generated service name.
   */
  get value(): string {
    return this.generated.value;
  }
}
