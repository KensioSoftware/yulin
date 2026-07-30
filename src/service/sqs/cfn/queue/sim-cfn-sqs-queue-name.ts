const maximumNameLength = 80;

interface SimCfnSqsQueueNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
}

/**
 * The name CloudFormation gives a queue whose template does not name it.
 *
 * Real CloudFormation generates `<stack name>-<logical ID>-<random>`. The
 * random part is left out here so a test can predict the name, which is the one
 * thing a template cannot rely on for real. Everything else follows AWS: two
 * stacks deploying the same template get different queue names, because the
 * stack name is part of it.
 *
 * A queue name is at most 80 characters, so a long stack name and logical ID
 * together are trimmed to fit. The start is kept, since that is where the stack
 * name is.
 */
export class SimCfnSqsQueueName {
  private readonly stackName: string | undefined;
  private readonly logicalId: string;

  constructor(properties: SimCfnSqsQueueNameProperties) {
    this.stackName = properties.stackName;
    this.logicalId = properties.logicalId;
  }

  /**
   * The generated queue name.
   */
  get value(): string {
    return this.composed().slice(0, maximumNameLength);
  }

  /**
   * The name before it is trimmed to the length SQS allows.
   *
   * A Resource created outside a stack has no stack name to derive one from, so
   * it falls back to the logical ID on its own.
   */
  private composed(): string {
    if (this.stackName === undefined || this.stackName === "") {
      return this.logicalId;
    }

    return `${this.stackName}-${this.logicalId}`;
  }
}
