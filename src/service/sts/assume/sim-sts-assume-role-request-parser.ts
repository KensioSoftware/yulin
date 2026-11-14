import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimIamConditionValue } from "../../iam/policy/sim-iam-policy.js";
import {
  IamRoleArnParser,
  type IamRoleArnParts,
} from "../../iam/role/arn/sim-iam-role-arn-parser.js";
import type { SimAssumeRoleCommand } from "../command/assume-role/assume-role.command.js";
import { SimStsAssumeRoleInputLimits } from "./sim-sts-assume-role-input-limits.js";
import {
  simStsSessionPolicyRequest,
  type SimStsSessionPolicyRequest,
} from "./sim-sts-session-policy-request.js";

export interface ParsedAssumeRoleRequest {
  readonly roleArn: string;
  readonly roleArnParts: IamRoleArnParts;
  readonly roleSessionName: string;
  readonly durationSeconds: number;

  /**
   * The session policies the request passed, or undefined where it passed
   * none.
   */
  readonly sessionPolicy: SimStsSessionPolicyRequest | undefined;
  readonly conditionContext:
    | Readonly<Record<string, SimIamConditionValue>>
    | undefined;
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
 * - a duration STS accepts, with the STS default applied when omitted;
 * - the session policies it passes, with the inline one parsed;
 * - IAM condition context derived from AssumeRole-specific command fields.
 *
 * Authorization and session creation consume the normalized request and remain
 * independent of SDK input validation details.
 */
export class SimStsAssumeRoleRequestParser {
  private readonly limits = new SimStsAssumeRoleInputLimits();

  constructor(private readonly roleArnParser = new IamRoleArnParser()) {}

  /**
   * Parse one AssumeRole command into the values used by authorization and
   * temporary session creation.
   *
   * Parsing fails before any authorization or session state changes occur. This
   * keeps malformed requests from reaching policy evaluation or IAM registries.
   */
  parse(command: SimAssumeRoleCommand): ParsedAssumeRoleRequest {
    const roleArn = command.input.RoleArn;
    assertDefined(roleArn, "STS AssumeRole RoleArn is required");

    const roleSessionName = command.input.RoleSessionName;
    assertDefined(
      roleSessionName,
      "STS AssumeRole RoleSessionName is required",
    );

    this.limits.roleSessionName(roleSessionName);
    this.limits.externalId(command.input.ExternalId);

    return {
      roleArn,
      roleArnParts: this.roleArnParser.parse(roleArn),
      roleSessionName,
      durationSeconds: this.limits.durationSeconds(
        command.input.DurationSeconds,
      ),
      sessionPolicy: simStsSessionPolicyRequest(command.input, this.limits),
      conditionContext: this.conditionContext(command.input.ExternalId),
    };
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
