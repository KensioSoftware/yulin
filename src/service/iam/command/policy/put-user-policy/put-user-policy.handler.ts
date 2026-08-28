import type { CommandHandler } from "../../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../../util/background/background.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";
import { SimIamPolicyDocumentValidator } from "../../../validate/sim-iam-policy-document-validator.js";
import type {
  SimPutUserPolicyCommand,
  SimPutUserPolicyCommandOutput,
} from "./put-user-policy.command.js";
import { assertDefined } from "../../../../../util/type-guard/defined.js";

interface PutUserPolicyCommandHandlerProperties {
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM PutUserPolicyCommand handler.
 *
 * PutUserPolicy creates or replaces an inline identity-based permissions policy
 * stored directly on a user. It does not create a managed IAM policy.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/iam/command/PutUserPolicyCommand/
 */
export class PutUserPolicyCommandHandler implements CommandHandler<
  SimPutUserPolicyCommand,
  SimPutUserPolicyCommandOutput
> {
  private readonly users: Map<SimIamUsername, SimIamUser>;
  private readonly background: BackgroundScheduler;
  private readonly policyDocValidator: SimIamPolicyDocumentValidator;

  constructor(properties: PutUserPolicyCommandHandlerProperties) {
    const { users, background = new BackgroundTasks() } = properties;

    this.users = users;
    this.background = background;
    this.policyDocValidator = new SimIamPolicyDocumentValidator();
  }

  /**
   * Handle a PutUserPolicyCommand from the SDK.
   */
  async handle(
    command: SimPutUserPolicyCommand,
  ): Promise<SimPutUserPolicyCommandOutput> {
    const username = command.input.UserName as SimIamUsername | undefined;
    assertDefined(username, "PutUserPolicyCommand.input.UserName");
    const policyName = command.input.PolicyName;
    assertDefined(policyName, "PutUserPolicyCommand.input.PolicyName");
    const policyDocument = command.input.PolicyDocument;

    this.policyDocValidator.validateRequired(policyDocument, {
      attachedTo: "User",
      name: username,
      policyName,
    });

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const user = this.users.get(username);

    if (user === undefined) {
      throw new SimIamNoSuchEntity(`No IAM User with name ${username}`);
    }

    user.inlinePolicies.set(policyName, policyDocument);

    return {};
  }
}
