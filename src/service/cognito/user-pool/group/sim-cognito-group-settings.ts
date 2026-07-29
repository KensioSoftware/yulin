import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

/**
 * The properties of a group that a request can set.
 *
 * `GroupName` is not among them: it identifies the group, and `UpdateGroup`
 * cannot change it.
 */
export interface SimCognitoGroupSettingsInput {
  readonly Description?: string | undefined;
  readonly Precedence?: number | undefined;
  readonly RoleArn?: string | undefined;
}

const maxDescriptionLength = 2048;

/**
 * The highest precedence Cognito accepts. Zero is the strongest, and a group
 * with no precedence at all is weaker than any of them.
 */
const maxPrecedence = 2 ** 31 - 1;

const roleArnLength = { least: 20, most: 2048 };

/**
 * The ARN form Cognito accepts for a group's role.
 *
 * Every part is limited to the characters Cognito allows, resource included:
 * an ARN holding a character it rejects has to fail here rather than in a
 * deployment. Real Cognito also caps the resource at three colon-separated
 * segments, which this does not count.
 */
const roleArnPattern =
  /^arn:[\w+=/,.@-]+:[\w+=/,.@-]+:[\w+=/,.@-]*:\d+:[\w+=/,.@:-]+$/u;

/**
 * The settable properties of one simulated group.
 *
 * All three are optional, and a group created without them reports none of
 * them, as real Cognito reports only the properties a group has.
 */
export class SimCognitoGroupSettings {
  public readonly description: string | undefined;
  public readonly precedence: number | undefined;
  public readonly roleArn: string | undefined;

  constructor(input: SimCognitoGroupSettingsInput = {}) {
    this.description = SimCognitoGroupSettings.description(input.Description);
    this.precedence = SimCognitoGroupSettings.precedence(input.Precedence);
    this.roleArn = SimCognitoGroupSettings.roleArn(input.RoleArn);
  }

  private static description(value: string | undefined): string | undefined {
    if (value !== undefined && value.length > maxDescriptionLength) {
      throw new SimCognitoInvalidParameterException(
        `Description is longer than the ${String(maxDescriptionLength)} ` +
          `characters Cognito allows`,
      );
    }

    return value;
  }

  /**
   * Read a requested precedence.
   *
   * Zero is a precedence like any other, and the strongest one, so it is kept
   * rather than treated as nothing.
   */
  private static precedence(value: number | undefined): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!Number.isSafeInteger(value) || value < 0 || value > maxPrecedence) {
      throw new SimCognitoInvalidParameterException(
        `Precedence must be a whole number between 0 and ${String(maxPrecedence)}`,
      );
    }

    return value;
  }

  private static roleArn(value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (
      value.length < roleArnLength.least ||
      value.length > roleArnLength.most ||
      !roleArnPattern.test(value)
    ) {
      throw new SimCognitoInvalidParameterException(
        `RoleArn '${value}' is not an ARN: a group's role takes the ` +
          `'arn:aws:iam::<account>:role/<name>' form`,
      );
    }

    return value;
  }
}
