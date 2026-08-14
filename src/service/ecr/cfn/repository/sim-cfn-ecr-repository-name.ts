import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";

const maximumNameLength = 256;

interface SimCfnEcrRepositoryNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
}

/**
 * The name CloudFormation gives a repository whose template does not name it.
 *
 * A repository name is at most 256 characters, so a long stack name and
 * logical ID together are trimmed to fit, the same way every other service's
 * generated name is. It is lower cased because ECR repository names are, and a
 * logical ID is usually not.
 */
export class SimCfnEcrRepositoryName {
  private readonly generated: SimCfnGeneratedResourceName;

  constructor(properties: SimCfnEcrRepositoryNameProperties) {
    this.generated = new SimCfnGeneratedResourceName({
      stackName: properties.stackName,
      logicalId: properties.logicalId,
      maximumLength: maximumNameLength,
    });
  }

  /**
   * The generated repository name.
   */
  get value(): string {
    return this.generated.value.toLowerCase();
  }
}
