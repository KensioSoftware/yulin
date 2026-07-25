import type { CommandHandler } from "../../../../../command/command-handler.js";
import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import { BackgroundTasks } from "../../../../../util/background/background.js";
import { SimIamAccessKey } from "../../../credential/sim-iam-access-key.js";
import type { SimIamCredentialRegistry } from "../../../credential/sim-iam-credential-registry.js";
import type { SimIamUserCredentialGenerator } from "../../../credential/user/sim-iam-user-credential-generator.js";
import { SimIamNoSuchEntity } from "../../../error/sim-iam.error.js";
import type { SimIamUser, SimIamUsername } from "../../../user/sim-iam-user.js";
import type {
  SimCreateAccessKeyCommand,
  SimCreateAccessKeyCommandOutput,
} from "./create-access-key.command.js";

interface CreateAccessKeyCommandHandlerProperties {
  readonly users: Map<SimIamUsername, SimIamUser>;
  readonly credentialRegistry: SimIamCredentialRegistry;
  readonly credentialGenerator: SimIamUserCredentialGenerator;
  readonly background?: BackgroundScheduler;
}

/**
 * IAM CreateAccessKey command handler for simulated IAM users.
 */
export class CreateAccessKeyCommandHandler implements CommandHandler<
  SimCreateAccessKeyCommand,
  SimCreateAccessKeyCommandOutput
> {
  private readonly users: Map<SimIamUsername, SimIamUser>;
  private readonly credentialRegistry: SimIamCredentialRegistry;
  private readonly credentialGenerator: SimIamUserCredentialGenerator;
  private readonly background: BackgroundScheduler;

  constructor(properties: CreateAccessKeyCommandHandlerProperties) {
    this.users = properties.users;
    this.credentialRegistry = properties.credentialRegistry;
    this.credentialGenerator = properties.credentialGenerator;
    this.background = properties.background ?? new BackgroundTasks();
  }

  /**
   * Handle a Create Access Key command from the SDK.
   */
  async handle(
    command: SimCreateAccessKeyCommand,
  ): Promise<SimCreateAccessKeyCommandOutput> {
    const username = command.input.UserName as SimIamUsername | undefined;

    if (username === undefined || username.length === 0) {
      throw new Error("UserName is required");
    }

    await this.background.sequence();

    const user = this.users.get(username);

    if (user === undefined) {
      throw new SimIamNoSuchEntity(`Sim IAM User does not exist: ${username}`);
    }

    const credentials = this.credentialGenerator.generate();
    const principal = {
      kind: "arn" as const,
      arn: user.arn,
    };

    const accessKey = new SimIamAccessKey({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      principal,
      identityPolicyPrincipal: principal,
    });

    /*
     * Register first. If a generated ID collides, neither the user nor the
     * registry is left with a partially created key.
     */
    this.credentialRegistry.registerAccessKey(accessKey);
    user.accessKeys.set(accessKey.accessKeyId, accessKey);

    return {
      AccessKey: {
        UserName: user.userName,
        AccessKeyId: accessKey.accessKeyId,
        Status: accessKey.status,
        SecretAccessKey: accessKey.secretAccessKey,
        CreateDate: accessKey.creationDate,
      },
    };
  }
}
