import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";

const maximumNameLength = 256;

interface SimCfnSnsTopicNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
}

/**
 * The name CloudFormation gives a topic whose template does not name it.
 *
 * A topic name is at most 256 characters, so a long stack name and logical ID
 * together are trimmed to fit. How a generated name is put together and trimmed
 * is the same for every service, and lives in
 * {@link SimCfnGeneratedResourceName}.
 */
export class SimCfnSnsTopicName {
  private readonly generated: SimCfnGeneratedResourceName;

  constructor(properties: SimCfnSnsTopicNameProperties) {
    this.generated = new SimCfnGeneratedResourceName({
      stackName: properties.stackName,
      logicalId: properties.logicalId,
      maximumLength: maximumNameLength,
    });
  }

  /**
   * The generated topic name.
   */
  get value(): string {
    return this.generated.value;
  }
}
