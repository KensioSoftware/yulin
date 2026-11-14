import type { CommandHandler } from "../../../../../command/command-handler.js";
import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";
import type {
  SimCreateRoleCommand,
  SimCreateRoleCommandOutput,
} from "./create-role.command.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import { CreateRoleRecordFactory } from "./create-role-record-factory.js";
import { assertSimIamNewEntity } from "../../sim-iam-account-quota.js";
import type { SimIamRole, SimIamRoleName } from "../../../role/sim-iam-role.js";
import { normaliseRolePath } from "../../../role/sim-iam-role-path.js";
import { simIamRoleNameInput } from "../../../role/sim-iam-role-name-input.js";
import { SimIamTrustPolicyDocumentValidator } from "../../../validate/trust/sim-iam-trust-policy-document-validator.js";
import { assertSimIamTrustPolicyWithinSizeLimit } from "../../../validate/size/sim-iam-policy-document-size.js";

interface CreateRoleCommandHandlerProperties {
  readonly accountId: SimAwsAccountId;
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM CreateRoleCommand handler.
 *
 * CreateRole accepts an AssumeRolePolicyDocument, which is the role trust
 * policy.
 * Inline identity permissions policies are added separately with PutRolePolicy.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/CreateRoleCommand/
 */
export class CreateRoleCommandHandler implements CommandHandler<
  SimCreateRoleCommand,
  SimCreateRoleCommandOutput
> {
  private readonly accountId: SimAwsAccountId;
  private readonly roles: Map<SimIamRoleName, SimIamRole>;
  private readonly roleFactory = new CreateRoleRecordFactory();
  private readonly trustPolicyValidator: SimIamTrustPolicyDocumentValidator;
  private readonly background: BackgroundScheduler;

  constructor(properties: CreateRoleCommandHandlerProperties) {
    const { accountId, roles, background = new BackgroundTasks() } = properties;

    this.accountId = accountId;
    this.roles = roles;
    this.trustPolicyValidator = new SimIamTrustPolicyDocumentValidator();
    this.background = background;
  }

  /**
   * Handle a CreateRoleCommand from the SDK.
   */
  async handle(
    command: SimCreateRoleCommand,
  ): Promise<SimCreateRoleCommandOutput> {
    const roleName = simIamRoleNameInput(command.input.RoleName);

    const trustPolicyDocument = command.input.AssumeRolePolicyDocument;

    assertSimIamTrustPolicyWithinSizeLimit(trustPolicyDocument, roleName);
    this.trustPolicyValidator.validateRequired(trustPolicyDocument);

    const path = normaliseRolePath(command.input.Path);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    assertSimIamNewEntity("Roles", this.roles.keys(), roleName);

    const role = this.roleFactory.makeRole({
      accountId: this.accountId,
      path,
      roleName,
      cmd: command,
      creationDate: this.background.now(),
    });

    this.roles.set(roleName, role);

    return this.roleFactory.makeOutput(role);
  }
}
