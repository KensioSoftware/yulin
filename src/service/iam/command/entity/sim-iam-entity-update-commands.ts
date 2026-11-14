import type { BackgroundScheduler } from "../../../../util/background/background.js";
import { assertSimIamMaxSessionDuration } from "../../role/sim-iam-role-session-duration.js";
import type { SimIamRole, SimIamRoleName } from "../../role/sim-iam-role.js";
import type { SimIamIdentityAuthorizer } from "../../tag/sim-iam-identity-authorizer.js";
import { assertSimIamTrustPolicyWithinSizeLimit } from "../../validate/size/sim-iam-policy-document-size.js";
import { SimIamTrustPolicyDocumentValidator } from "../../validate/trust/sim-iam-trust-policy-document-validator.js";
import { simIamFound } from "../sim-iam-found.js";
import type { SimIamRequestOptions } from "../sim-iam-request-options.js";
import { simIamRequired } from "../sim-iam-required.js";
import type { SimIamEmptyOutput } from "./sim-iam-entity-policy.command.js";
import type {
  SimUpdateAssumeRolePolicyCommand,
  SimUpdateRoleCommand,
} from "./sim-iam-entity-update.command.js";

interface SimIamRoleUpdateCommandsProperties {
  readonly roles: Map<SimIamRoleName, SimIamRole>;
  readonly roleIdentity: SimIamIdentityAuthorizer;
  readonly background: BackgroundScheduler;
}

/**
 * The commands that change a Role after it is created: its description,
 * maximum session and trust policy.
 */
export class SimIamRoleUpdateCommands {
  private readonly trustValidator: SimIamTrustPolicyDocumentValidator =
    new SimIamTrustPolicyDocumentValidator();

  constructor(
    private readonly properties: SimIamRoleUpdateCommandsProperties,
  ) {}

  /**
   * Change a Role's description or maximum session duration. A member the
   * command leaves out keeps its value.
   */
  async updateRole(
    command: SimUpdateRoleCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    const { Description, MaxSessionDuration } = command.input;
    assertSimIamMaxSessionDuration(MaxSessionDuration);
    const role = await this.role("UpdateRole", command.input.RoleName, options);

    role.description = Description ?? role.description;
    role.maxSessionDuration = MaxSessionDuration ?? role.maxSessionDuration;

    return {};
  }

  /**
   * Replace a Role's trust policy.
   */
  async updateAssumeRolePolicy(
    command: SimUpdateAssumeRolePolicyCommand,
    options?: SimIamRequestOptions,
  ): Promise<SimIamEmptyOutput> {
    const { RoleName, PolicyDocument } = command.input;
    const role = await this.role("UpdateAssumeRolePolicy", RoleName, options);
    assertSimIamTrustPolicyWithinSizeLimit(PolicyDocument, role.roleName);
    this.trustValidator.validateRequired(PolicyDocument);
    role.assumeRolePolicyDocument = PolicyDocument;

    return {};
  }

  private async role(
    action: string,
    roleName: string | undefined,
    options: SimIamRequestOptions | undefined,
  ): Promise<SimIamRole> {
    const { roleIdentity, roles, background } = this.properties;
    const name = simIamRequired(roleName, "roleName");
    roleIdentity.authorize(`iam:${action}`, name, options);
    await background.sequence();

    return simIamFound(roles.get(name as SimIamRoleName), "role", name);
  }
}
