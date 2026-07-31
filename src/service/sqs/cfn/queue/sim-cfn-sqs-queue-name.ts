import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";

const maximumNameLength = 80;

interface SimCfnSqsQueueNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
}

/**
 * The name CloudFormation gives a queue whose template does not name it.
 *
 * A queue name is at most 80 characters, so a long stack name and logical ID
 * together are trimmed to fit. How a generated name is put together and
 * trimmed is the same for every service, and lives in
 * {@link SimCfnGeneratedResourceName}.
 */
export class SimCfnSqsQueueName {
  private readonly generated: SimCfnGeneratedResourceName;

  constructor(properties: SimCfnSqsQueueNameProperties) {
    this.generated = new SimCfnGeneratedResourceName({
      stackName: properties.stackName,
      logicalId: properties.logicalId,
      maximumLength: maximumNameLength,
    });
  }

  /**
   * The generated queue name.
   */
  get value(): string {
    return this.generated.value;
  }
}
