import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";

const maximumNameLength = 128;

interface SimCfnKinesisStreamNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
}

/**
 * The name CloudFormation gives a stream whose template does not name it.
 *
 * A stream name is at most 128 characters, so a long stack name and logical ID
 * together are trimmed to fit. How a generated name is put together and trimmed
 * is the same for every service, and lives in
 * {@link SimCfnGeneratedResourceName}.
 */
export class SimCfnKinesisStreamName {
  private readonly generated: SimCfnGeneratedResourceName;

  constructor(properties: SimCfnKinesisStreamNameProperties) {
    this.generated = new SimCfnGeneratedResourceName({
      stackName: properties.stackName,
      logicalId: properties.logicalId,
      maximumLength: maximumNameLength,
    });
  }

  /**
   * The generated stream name.
   */
  get value(): string {
    return this.generated.value;
  }
}
