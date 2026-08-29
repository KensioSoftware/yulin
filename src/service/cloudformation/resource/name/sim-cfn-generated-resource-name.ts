import { createHash } from "node:crypto";

/**
 * How many characters the tail on the end of a generated name is, which is as
 * many as the random characters real CloudFormation ends one with.
 */
const tailLength = 12;

interface SimCfnGeneratedResourceNameProperties {
  readonly stackName: string | undefined;
  readonly logicalId: string;
  readonly maximumLength: number;
}

/**
 * The name CloudFormation gives a Resource whose template does not name it.
 *
 * CloudFormation generates `<stack name>-<logical ID>-<random>`. The tail here
 * is a hash of the other two parts rather than random characters. The same
 * template deployed under the same stack name generates the same name again,
 * and a test can read it back and compare. Everything else follows AWS. Two
 * stacks deploying the same template get different names, because the stack
 * name is part of it.
 *
 * Each service has its own limit on how long a name can be, and CloudFormation
 * reserves the last thirteen characters of it for the tail and its hyphen. What
 * is left over goes to the stack name and the logical ID either side of one
 * more hyphen, half each, the stack name rounding up and either taking what the
 * other does not use. Where a service allows 64 characters, a long stack name
 * and a long logical ID keep 25 each. The rule is inferred from names real
 * CloudFormation produced, since AWS documents none of it.
 *
 * The tail is derived from the whole untrimmed name. That is what keeps two
 * trimmed names apart. CDK puts its own disambiguating hash at the end of a
 * logical ID, which is exactly what trimming cuts off, so without that two
 * Resources in one stack could end up asking for the same name.
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
    const tail = this.tail();

    if (this.maximumLength <= tailLength + 1) {
      return tail.slice(0, this.maximumLength);
    }

    return `${this.trimmed()}-${tail}`;
  }

  /**
   * The stack name and logical ID, trimmed to the room the tail leaves them.
   *
   * A name that already fits is kept whole. One that does not gives each part
   * half of what is left. The stack name is trimmed rather than lost, since
   * that is the part an IAM policy scoped by resource prefix matches on.
   */
  private trimmed(): string {
    const composed = this.composed();
    const budget = this.maximumLength - tailLength - 1;

    if (composed.length <= budget) {
      return composed;
    }

    if (this.stackName === undefined || this.stackName === "") {
      return composed.slice(0, budget);
    }

    const shared = budget - 1;
    const stackNameKept = Math.min(
      this.stackName.length,
      shared - Math.min(this.logicalId.length, Math.floor(shared / 2)),
    );

    return [
      this.stackName.slice(0, stackNameKept),
      this.logicalId.slice(0, shared - stackNameKept),
    ].join("-");
  }

  /**
   * The tail the name ends with, derived from the whole untrimmed name.
   *
   * It is a hash rather than the random characters real CloudFormation uses, so
   * the name stays the same between deployments of the same template. Hex
   * suits every service, since one that only allows lowercase takes it as it
   * is.
   */
  private tail(): string {
    return createHash("sha1")
      .update(this.composed())
      .digest("hex")
      .slice(0, tailLength);
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
