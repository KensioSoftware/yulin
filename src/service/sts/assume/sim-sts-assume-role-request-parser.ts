import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimIamConditionValue } from "../../iam/policy/sim-iam-policy.js";
import {
  IamRoleArnParser,
  type IamRoleArnParts,
} from "../../iam/role/arn/sim-iam-role-arn-parser.js";
import type { SimAssumeRoleCommand } from "../command/assume-role/assume-role.cmd.js";

const defaultRoleSessionDurationSeconds = 3600;

export interface ParsedAssumeRoleRequest {
  readonly roleArn: string;
  readonly roleArnParts: IamRoleArnParts;
  readonly roleSessionName: string;
  readonly durationSeconds: number;
  readonly conditionContext:
    Readonly<Record<string, SimIamConditionValue>> | undefined;
}

/**
 * Validates and normalizes an STS AssumeRole command.
 *
 * SDK command fields are optional at the TypeScript boundary because the AWS
 * SDK validates required values at runtime. The rest of the simulated STS flow
 * should not need to repeat those checks or work with optional values.
 *
 * This parser converts the command into a request with:
 *
 * - required Role ARN and session name values;
 * - parsed Role ARN parts used for target-account lookup;
 * - a positive duration with the STS default applied when omitted;
 * - IAM condition context derived from AssumeRole-specific command fields.
 *
 * Authorization and session creation consume the normalized request and remain
 * independent of SDK input validation details.
 */
export class SimStsAssumeRoleRequestParser {
  constructor(private readonly roleArnParser = new IamRoleArnParser()) {}

  /**
   * Parse one AssumeRole command into the values used by authorization and
   * temporary session creation.
   *
   * Parsing fails before any authorization or session state changes occur. This
   * keeps malformed requests from reaching policy evaluation or IAM registries.
   */
  parse(cmd: SimAssumeRoleCommand): ParsedAssumeRoleRequest {
    const roleArn = cmd.input.RoleArn;
    assertDefined(roleArn, "STS AssumeRole RoleArn is required");

    const roleSessionName = cmd.input.RoleSessionName;
    assertDefined(
      roleSessionName,
      "STS AssumeRole RoleSessionName is required",
    );

    const durationSeconds = this.durationSeconds(cmd.input.DurationSeconds);

    return {
      roleArn,
      roleArnParts: this.roleArnParser.parse(roleArn),
      roleSessionName,
      durationSeconds,
      conditionContext: this.conditionContext(cmd.input.ExternalId),
    };
  }

  /**
   * Apply the default session duration and reject invalid explicit values.
   *
   * Session duration is represented in whole seconds. Zero, negative numbers,
   * fractional values, NaN, and infinities are rejected because they cannot
   * describe a valid credential lifetime.
   */
  private durationSeconds(value: number | undefined): number {
    const durationSeconds = value ?? defaultRoleSessionDurationSeconds;

    /* v8 ignore if */
    if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0) {
      throw new Error("DurationSeconds must be a positive integer");
    }

    return durationSeconds;
  }

  /**
   * Convert AssumeRole-specific request fields into IAM condition values.
   *
   * ExternalId participates in trust-policy authorization through the
   * `sts:ExternalId` condition key. An omitted ExternalId produces no condition
   * entry, allowing the IAM matcher to treat policies requiring that key as
   * non-matching.
   */
  private conditionContext(
    externalId: string | undefined,
  ): ParsedAssumeRoleRequest["conditionContext"] {
    if (externalId === undefined) {
      return undefined;
    }

    return {
      "sts:ExternalId": externalId,
    };
  }
}
