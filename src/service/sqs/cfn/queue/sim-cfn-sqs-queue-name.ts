import { SimCfnGeneratedResourceName } from "../../../cloudformation/resource/name/sim-cfn-generated-resource-name.js";

const maximumNameLength = 80;

const fifoSuffix = ".fifo";

interface SimCfnSqsQueueNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
  readonly fifo?: boolean | undefined;
}

/**
 * The name CloudFormation gives a queue whose template does not name it.
 *
 * A queue name is at most 80 characters, so a long stack name and logical ID
 * together are trimmed to fit. How a generated name is put together and
 * trimmed is the same for every service, and lives in
 * {@link SimCfnGeneratedResourceName}.
 *
 * A FIFO queue's generated name ends `.fifo`, as real CloudFormation ends one,
 * and the rest of it is trimmed to leave room for the suffix.
 */
export class SimCfnSqsQueueName {
  private readonly generated: SimCfnGeneratedResourceName;
  private readonly suffix: string;

  constructor(properties: SimCfnSqsQueueNameProperties) {
    this.suffix = suffixFor(properties.fifo === true);
    this.generated = new SimCfnGeneratedResourceName({
      stackName: properties.stackName,
      logicalId: properties.logicalId,
      maximumLength: maximumNameLength - this.suffix.length,
    });
  }

  /**
   * The generated queue name.
   */
  get value(): string {
    return this.generated.value + this.suffix;
  }
}

function suffixFor(fifo: boolean): string {
  if (fifo) {
    return fifoSuffix;
  }

  return "";
}
