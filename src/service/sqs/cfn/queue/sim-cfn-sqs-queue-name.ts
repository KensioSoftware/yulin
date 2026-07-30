import { createHash } from "node:crypto";

const maximumNameLength = 80;

/**
 * How many characters of the hash of the untrimmed name a trimmed one ends
 * with, so two long names that start the same do not become one name.
 */
const distinguisherLength = 8;

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
 * name is, and the trimmed name ends in a hash of the untrimmed one. CDK puts
 * its own disambiguating hash at the end of a logical ID, which is exactly what
 * trimming cuts off, so without that two queues in one stack could end up
 * asking for the same name.
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
    const composed = this.composed();

    if (composed.length <= maximumNameLength) {
      return composed;
    }

    const kept = composed.slice(0, maximumNameLength - distinguisherLength - 1);

    return `${kept}-${this.distinguisher(composed)}`;
  }

  /**
   * The tail a trimmed name ends with, derived from the whole untrimmed name.
   *
   * It is a hash rather than the random characters real CloudFormation uses, so
   * the name stays the same between deployments of the same template.
   */
  private distinguisher(composed: string): string {
    return createHash("sha1")
      .update(composed)
      .digest("hex")
      .slice(0, distinguisherLength);
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
