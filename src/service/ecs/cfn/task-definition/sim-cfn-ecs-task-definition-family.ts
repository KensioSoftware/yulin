import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";

/**
 * How long an ECS task definition family may be.
 */
const maximumFamilyLength = 255;

interface SimCfnEcsTaskDefinitionFamilyProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
}

/**
 * The family CloudFormation gives a task definition whose template does not
 * name one.
 *
 * Real CloudFormation composes it from the stack name, the logical ID and a
 * random part, which is why a template that leaves `Family` out is a template
 * whose family nothing can predict. The random part is left out here so a test
 * can name the family it got, and a binding that would rather not depend on
 * that names the task definition's logical ID instead.
 */
export class SimCfnEcsTaskDefinitionFamily {
  private readonly generated: SimCfnGeneratedResourceName;

  constructor(properties: SimCfnEcsTaskDefinitionFamilyProperties) {
    this.generated = new SimCfnGeneratedResourceName({
      stackName: properties.stackName,
      logicalId: properties.logicalId,
      maximumLength: maximumFamilyLength,
    });
  }

  /**
   * The generated family.
   */
  get value(): string {
    return this.generated.value;
  }
}
