import type { SimArnPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type { SimGetRoleCommandOutput } from "../../iam/command/role/get-role/get-role.command.js";
import type { SimIamAccountResolver } from "../../iam/registry/sim-iam-account-resolver.js";
import type { IamRoleArnParts } from "../../iam/role/arn/sim-iam-role-arn-parser.js";
import type { SimAssumeRoleCommandOutput } from "../command/assume-role/assume-role.command.js";

interface AssumeRoleSessionCreatorProperties {
  readonly iamResolver: SimIamAccountResolver;
}

interface CreateAssumeRoleSessionInput {
  readonly roleArnParts: IamRoleArnParts;
  readonly role: SimGetRoleCommandOutput["Role"];
  readonly roleSessionName: string;
  readonly sourcePrincipal: SimArnPrincipal;
  readonly durationSeconds: number;
}

/**
 * Creates the temporary IAM Role session returned by STS AssumeRole.
 *
 * Authorization must be completed before this class is called. This class does
 * not inspect policies or decide whether the caller may assume the Role. Its
 * responsibility starts after authorization and covers:
 *
 * - resolving the target account's IAM session manager;
 * - calculating the session creation and expiration timestamps;
 * - creating the temporary Role session and its credentials;
 * - mapping internal session data to the public AssumeRole response shape.
 *
 * Keeping these operations together ensures the same expiration timestamp is
 * stored in the session and returned to the SDK caller.
 */
export class SimStsAssumeRoleSessionCreator {
  private readonly iamResolver: SimIamAccountResolver;

  constructor(properties: AssumeRoleSessionCreatorProperties) {
    this.iamResolver = properties.iamResolver;
  }

  /**
   * Create a temporary session for an authorized AssumeRole request.
   *
   * `roleArnParts.accountId` selects the IAM facade that owns the target Role.
   * The Role name and ID come from the resolved Role, while the session name and
   * source principal come from the original request context.
   */
  create(input: CreateAssumeRoleSessionInput): SimAssumeRoleCommandOutput {
    const createDate = new Date();
    const expiration = this.expiration(createDate, input.durationSeconds);
    const targetIam = this.iamResolver.iamForAccount(
      input.roleArnParts.accountId,
    );

    const createdSession = targetIam.sessionManager.createRoleSession({
      roleName: input.role.RoleName,
      sessionName: input.roleSessionName,
      sourcePrincipal: input.sourcePrincipal,
      createDate,
      expiration,
    });

    return {
      Credentials: {
        AccessKeyId: createdSession.credentials.accessKeyId,
        SecretAccessKey: createdSession.credentials.secretAccessKey,
        SessionToken: createdSession.credentials.sessionToken,
        Expiration: expiration,
      },
      AssumedRoleUser: {
        AssumedRoleId: `${input.role.RoleId}:${input.roleSessionName}`,
        Arn: createdSession.session.principal.arn,
      },
      $metadata: {},
    };
  }

  /**
   * Calculate the credential expiration from the session creation time.
   *
   * STS durations are expressed in seconds, while JavaScript Date arithmetic
   * uses milliseconds. Using the supplied creation timestamp as the base keeps
   * session metadata and returned credential metadata on the same timeline.
   */
  private expiration(createDate: Date, durationSeconds: number): Date {
    return new Date(createDate.getTime() + durationSeconds * 1000);
  }
}
