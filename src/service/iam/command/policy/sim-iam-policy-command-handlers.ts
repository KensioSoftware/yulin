import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimArn } from "../../../aws/arn.js";
import type { SimIamActionAuthorizer } from "../../authorize/sim-iam-action-authorizer.js";
import type { SimIamManagedPolicy } from "../../policy/sim-iam-policy.js";
import type { SimIamUser, SimIamUsername } from "../../user/sim-iam-user.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { CreatePolicyCommandHandler } from "./create-policy/create-policy.handler.js";
import type {
  SimCreatePolicyCommand,
  SimCreatePolicyCommandOutput,
} from "./create-policy/create-policy.command.js";
import { GetPolicyCommandHandler } from "./get-policy/get-policy.handler.js";
import type {
  SimGetPolicyCommand,
  SimGetPolicyCommandOutput,
} from "./get-policy/get-policy.command.js";
import { ListPoliciesCommandHandler } from "./list-policies/list-policies.handler.js";
import type {
  SimListPoliciesCommand,
  SimListPoliciesCommandOutput,
} from "./list-policies/list-policies.command.js";
import { PutUserPolicyCommandHandler } from "./put-user-policy/put-user-policy.handler.js";
import type {
  SimPutUserPolicyCommand,
  SimPutUserPolicyCommandOutput,
} from "./put-user-policy/put-user-policy.command.js";

interface SimIamPolicyCommandHandlersProperties {
  readonly accountId: SimAwsAccountId;
  readonly policies: Map<SimArn, SimIamManagedPolicy>;
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly background: BackgroundScheduler;
  readonly authorizer: SimIamActionAuthorizer;
}

/**
 * Wires and runs the SDK command handlers that operate on IAM policies.
 *
 * Grouping the policy command wiring here keeps the SimIam facade a thin
 * delegator, mirroring the role and user command handlers. Each command is
 * authorized for the request caller before it runs.
 */
export class SimIamPolicyCommandHandlers {
  private readonly accountId: SimAwsAccountId;
  private readonly policies: Map<SimArn, SimIamManagedPolicy>;
  private readonly users: Map<SimIamUsername, SimIamUser>;
  private readonly background: BackgroundScheduler;
  private readonly authorizer: SimIamActionAuthorizer;

  constructor(properties: SimIamPolicyCommandHandlersProperties) {
    const { accountId, policies, users, background, authorizer } = properties;

    this.accountId = accountId;
    this.policies = policies;
    this.users = users;
    this.background = background;
    this.authorizer = authorizer;
  }

  /**
   * Handle a CreatePolicy command from the SDK.
   */
  async createPolicy(
    command: SimCreatePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimCreatePolicyCommandOutput> {
    this.authorizer.authorize(
      "iam:CreatePolicy",
      `arn:aws:iam::${this.accountId}:policy/${command.input.PolicyName ?? "*"}`,
      options?.caller,
    );
    const handler = new CreatePolicyCommandHandler({
      accountId: this.accountId,
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a GetPolicy command from the SDK.
   */
  async getPolicy(
    command: SimGetPolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimGetPolicyCommandOutput> {
    this.authorizer.authorize(
      "iam:GetPolicy",
      command.input.PolicyArn ?? "*",
      options?.caller,
    );
    const handler = new GetPolicyCommandHandler({
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a ListPolicies command from the SDK.
   */
  async listPolicies(
    command: SimListPoliciesCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimListPoliciesCommandOutput> {
    this.authorizer.authorize("iam:ListPolicies", "*", options?.caller);
    const handler = new ListPoliciesCommandHandler({
      policies: this.policies,
      background: this.background,
    });
    return await handler.handle(command);
  }

  /**
   * Handle a PutUserPolicy command from the SDK.
   */
  async putUserPolicy(
    command: SimPutUserPolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimPutUserPolicyCommandOutput> {
    this.authorizer.authorize(
      "iam:PutUserPolicy",
      `arn:aws:iam::${this.accountId}:user/${command.input.UserName ?? "*"}`,
      options?.caller,
    );
    const handler = new PutUserPolicyCommandHandler({
      users: this.users,
      background: this.background,
    });
    return await handler.handle(command);
  }
}
