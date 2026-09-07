import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimSecretsManagerSecret } from "../../secret/sim-secrets-manager-secret.js";
import type { SimSecretsManager } from "../../sim-secrets-manager.js";

interface SimCfnSecretsManagerSecretDeleterProperties {
  readonly secretsManager: SimSecretsManager;
}

/**
 * Removes the secret an AWS::SecretsManager::Secret Resource deployed.
 *
 * DeleteSecret schedules the deletion rather than carrying it out, so a torn
 * down Stack leaves a secret waiting out its recovery window. That is what
 * CloudFormation does, and the point of the window is that the secret is
 * recoverable afterwards.
 */
export class SimCfnSecretsManagerSecretDeleter {
  private readonly secretsManager: SimSecretsManager;

  constructor(properties: SimCfnSecretsManagerSecretDeleterProperties) {
    this.secretsManager = properties.secretsManager;
  }

  /**
   * Schedule the deployed secret's deletion.
   */
  async delete(
    resource: SimCfnResource,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    const secret = resource.simResource as SimSecretsManagerSecret | undefined;
    assertDefined(
      secret,
      `sim Secrets Manager secret for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.secretsManager.deleteSecret(
      { input: { SecretId: secret.arn.value } },
      options,
    );
  }
}
