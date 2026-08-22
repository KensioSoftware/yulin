import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";

const maximumNameLength = 64;

interface SimCfnFirehoseDeliveryStreamNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
}

/**
 * The name CloudFormation gives a delivery stream whose template does not name
 * it.
 *
 * A delivery stream name is at most 64 characters, so a long stack name and
 * logical ID together are trimmed to fit. How a generated name is put together
 * and trimmed is the same for every service, and lives in
 * {@link SimCfnGeneratedResourceName}.
 */
export class SimCfnFirehoseDeliveryStreamName {
  private readonly generated: SimCfnGeneratedResourceName;

  constructor(properties: SimCfnFirehoseDeliveryStreamNameProperties) {
    this.generated = new SimCfnGeneratedResourceName({
      stackName: properties.stackName,
      logicalId: properties.logicalId,
      maximumLength: maximumNameLength,
    });
  }

  /**
   * The generated delivery stream name.
   */
  get value(): string {
    return this.generated.value;
  }
}
