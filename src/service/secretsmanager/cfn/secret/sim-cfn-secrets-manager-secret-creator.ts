import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimSecretsManagerSecret } from "../../secret/sim-secrets-manager-secret.js";
import type { SimSecretsManager } from "../../sim-secrets-manager.js";
import { SimCfnSecretsManagerSecretProperties } from "./sim-cfn-secrets-manager-secret-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnSecretsManagerSecretCreatorProperties {
  readonly secretsManager: SimSecretsManager;
}

/**
 * Creates simulated secrets from AWS::SecretsManager::Secret Resources.
 *
 * The secret is created through the ordinary CreateSecret command rather than
 * constructed directly, so a secret a template deployed is the same thing an
 * SDK caller would have got, name validation and ARN suffix included.
 */
export class SimCfnSecretsManagerSecretCreator {
  private readonly secretsManager: SimSecretsManager;

  constructor(properties: SimCfnSecretsManagerSecretCreatorProperties) {
    this.secretsManager = properties.secretsManager;
  }

  /**
   * Create a secret from an AWS::SecretsManager::Secret Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimSecretsManagerSecret> {
    const secretProperties = new SimCfnSecretsManagerSecretProperties({
      resource,
      properties,
    });

    const created = await this.secretsManager.createSecret(
      {
        input: {
          Name: secretProperties.name(),
          Description: secretProperties.description(),
          KmsKeyId: secretProperties.kmsKeyId(),
          SecretString: secretProperties.secretString(),
          Tags: secretProperties.tags(),
        },
      },
      options,
    );

    assertDefined(
      created.ARN,
      `sim Secrets Manager secret ARN after CloudFormation creation for ${resource.logicalId}`,
    );

    const secret = this.secretsManager.findSecret(created.ARN);
    assertDefined(
      secret,
      `sim Secrets Manager secret ${created.ARN} after CloudFormation creation`,
    );

    return secret;
  }
}
