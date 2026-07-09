import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import type {
  SimPutRolePolicyCommand,
  SimPutRolePolicyCommandOutput,
} from "./put-role-policy.cmd.js";
import { SimIamPolicyDocumentValidator } from "../../../validate/sim-iam-policy-doc-validator.js";

interface PutRolePolicyCommandHandlerProps {
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM PutRolePolicyCommand handler.
 *
 * PutRolePolicy creates or replaces an inline identity-based permissions policy
 * stored directly on a role. It does not create a managed IAM policy and should
 * not affect ListPolicies output.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/PutRolePolicyCommand/
 */
export class PutRolePolicyCommandHandler implements CommandHandler<
  SimPutRolePolicyCommand,
  SimPutRolePolicyCommandOutput
> {
  private readonly roles: Map<SimIamRoleName, SimIamRole>;
  private readonly background: BackgroundScheduler;
  private readonly policyDocValidator: SimIamPolicyDocumentValidator;

  constructor(props: PutRolePolicyCommandHandlerProps) {
    const { roles, background = new BackgroundTasks() } = props;

    this.roles = roles;
    this.background = background;
    this.policyDocValidator = new SimIamPolicyDocumentValidator();
  }

  /**
   * Handle a PutRolePolicyCommand from the SDK.
   */
  async handle(
    cmd: SimPutRolePolicyCommand,
  ): Promise<SimPutRolePolicyCommandOutput> {
    const roleName = cmd.input.RoleName as SimIamRoleName | undefined;
    const policyName = cmd.input.PolicyName;
    const policyDocument = cmd.input.PolicyDocument;

    if (roleName === undefined || roleName.length === 0) {
      throw new Error("RoleName is required");
    }

    if (policyName === undefined || policyName.length === 0) {
      throw new Error("PolicyName is required");
    }

    this.policyDocValidator.validateRequired(policyDocument);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const role = this.roles.get(roleName);

    if (role === undefined) {
      throw new SimIamNoSuchEntity(`No IAM Role with name ${roleName}`);
    }

    role.inlinePolicies.set(policyName, policyDocument);

    return {};
  }
}
