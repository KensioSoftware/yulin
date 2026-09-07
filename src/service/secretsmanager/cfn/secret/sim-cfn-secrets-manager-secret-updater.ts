import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceInPlaceUpdateContext } from "../../../cloudformation/resource/sim-cfn-resource.type.js";
import { simCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimSecretsManagerSecret } from "../../secret/sim-secrets-manager-secret.js";
import type { SimSecretsManager } from "../../sim-secrets-manager.js";
import { simCfnSecretsManagerSecretValueChanged } from "./sim-cfn-secrets-manager-secret-change.js";
import { SimCfnSecretsManagerSecretProperties } from "./sim-cfn-secrets-manager-secret-properties.js";

interface SimCfnSecretsManagerSecretUpdaterProperties {
  readonly secretsManager: SimSecretsManager;
}

/**
 * Applies a changed AWS::SecretsManager::Secret Resource to the deployed
 * secret.
 *
 * Every property but `Name` is applied with no interruption, as real
 * CloudFormation applies it. That matters most for the value. A secret keeps
 * its versions across a description or a tag change, and the things holding a
 * copy of the value stay in step with it.
 *
 * Replacing instead would also fail. DeleteSecret schedules the deletion and
 * leaves the name held for the recovery window. The secret taking its place
 * would then ask for a name the deleted one still has.
 */
export class SimCfnSecretsManagerSecretUpdater {
  private readonly secretsManager: SimSecretsManager;

  constructor(properties: SimCfnSecretsManagerSecretUpdaterProperties) {
    this.secretsManager = properties.secretsManager;
  }

  /**
   * Apply the new Resource definition to the deployed secret.
   */
  async update(
    current: SimCfnResource,
    updated: SimCfnResource,
    context: SimCloudFormationResourceInPlaceUpdateContext,
  ): Promise<SimSecretsManagerSecret> {
    const secret = current.simResource as SimSecretsManagerSecret | undefined;
    assertDefined(
      secret,
      `sim Secrets Manager secret for CloudFormation Resource ${current.logicalId}`,
    );

    const properties = new SimCfnSecretsManagerSecretProperties({
      resource: updated,
      properties: context.updatedResolvedProperties,
    });
    const kmsKeyId = properties.kmsKeyId();

    await this.secretsManager.updateSecret(
      {
        input: {
          SecretId: secret.arn.value,
          // CloudFormation applies the template as the desired state, so a
          // Description the new template leaves out is cleared rather than
          // left as it was. An empty one is how UpdateSecret clears it.
          Description: properties.description() ?? "",
          KmsKeyId: kmsKeyId,
          SecretString: this.changedValue(properties, context),
        },
      },
      simCfnResourceCallerOptions(context.caller),
    );

    // The parts UpdateSecret has no way to ask for. Real Secrets Manager
    // changes tags with TagResource and UntagResource, which are not
    // simulated, and UpdateSecret cannot put a secret back on the
    // aws/secretsmanager key.
    if (kmsKeyId === undefined) {
      secret.kmsKeyId = undefined;
    }

    secret.tags = properties.tags() ?? [];

    return secret;
  }

  /**
   * The value to write, where the new template asks for a different one.
   *
   * Nothing is written for an unchanged value. Regenerating a password for a
   * description change would leave every copy of it taken at deployment
   * holding the old one.
   */
  private changedValue(
    properties: SimCfnSecretsManagerSecretProperties,
    context: SimCloudFormationResourceInPlaceUpdateContext,
  ): string | undefined {
    const changed = simCfnSecretsManagerSecretValueChanged(
      context.currentResolvedProperties,
      context.updatedResolvedProperties,
    );

    return changed ? properties.secretString() : undefined;
  }
}
