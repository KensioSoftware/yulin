import { createHash } from "node:crypto";

/**
 * How many characters of the hash of the untrimmed name a trimmed one ends
 * with, so two long names that start the same do not become one name.
 */
const distinguisherLength = 8;

interface SimCfnGeneratedResourceNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
  readonly maximumLength: number;
}

/**
 * The name CloudFormation gives a Resource whose template does not name it.
 *
 * Real CloudFormation generates `<stack name>-<logical ID>-<random>`. The
 * random part is left out here so a test can predict the name, which is the one
 * thing a template cannot rely on for real. Everything else follows AWS: two
 * stacks deploying the same template get different names, because the stack
 * name is part of it.
 *
 * Each service has its own limit on how long a name can be, so a long stack
 * name and logical ID together are trimmed to fit. The start is kept, since
 * that is where the stack name is, and the trimmed name ends in a hash of the
 * untrimmed one. CDK puts its own disambiguating hash at the end of a logical
 * ID, which is exactly what trimming cuts off, so without that two Resources in
 * one stack could end up asking for the same name.
 */
export class SimCfnGeneratedResourceName {
  private readonly stackName: string | undefined;
  private readonly logicalId: string;
  private readonly maximumLength: number;

  constructor(properties: SimCfnGeneratedResourceNameProperties) {
    this.stackName = properties.stackName;
    this.logicalId = properties.logicalId;
    this.maximumLength = properties.maximumLength;
  }

  /**
   * The generated name.
   */
  get value(): string {
    const composed = this.composed();

    if (composed.length <= this.maximumLength) {
      return composed;
    }

    const kept = composed.slice(
      0,
      this.maximumLength - distinguisherLength - 1,
    );

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
   * The name before it is trimmed to the length the service allows.
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
