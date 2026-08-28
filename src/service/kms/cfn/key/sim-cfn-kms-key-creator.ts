import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimKmsKey } from "../../key/sim-kms-key.js";
import type { SimKms } from "../../sim-kms.js";
import { SimCfnKmsKeyProperties } from "./sim-cfn-kms-key-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnKmsKeyCreatorProperties {
  readonly kms: SimKms;
}

/**
 * Creates simulated KMS keys from AWS::KMS::Key Resources.
 *
 * The key is created through the ordinary CreateKey command rather than
 * constructed directly, so a key a template deployed is the same thing an SDK
 * caller would have got: real key material, the same key policy handling, and
 * the same refusal of key types this simulation does not model.
 */
export class SimCfnKmsKeyCreator {
  private readonly kms: SimKms;

  constructor(properties: SimCfnKmsKeyCreatorProperties) {
    this.kms = properties.kms;
  }

  /**
   * Create a key from an AWS::KMS::Key Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimKmsKey> {
    const keyProperties = new SimCfnKmsKeyProperties({ resource, properties });

    const created = await this.kms.createKey(
      {
        input: {
          Description: keyProperties.description(),
          Policy: keyProperties.policy(),
          KeySpec: keyProperties.keySpec(),
          KeyUsage: keyProperties.keyUsage(),
          Origin: keyProperties.origin(),
        },
      },
      options,
    );

    const keyId = created.KeyMetadata?.KeyId;
    assertDefined(
      keyId,
      `sim KMS key ID after CloudFormation creation for ${resource.logicalId}`,
    );

    const key = this.kms.findKey(keyId);
    assertDefined(key, `sim KMS key ${keyId} after CloudFormation creation`);

    await this.applyEnabled(keyId, keyProperties.enabled(), options);

    return key;
  }

  /**
   * Apply `Enabled: false`, which asks for a key that is disabled the moment
   * it exists.
   *
   * CreateKey has no input for that, as the real API has none either. Real
   * CloudFormation makes the key and then disables it, and this goes through
   * DisableKey for the same reason, so a deployment allowed to make keys and
   * not to disable them is refused here rather than quietly disabling one.
   */
  private async applyEnabled(
    keyId: string,
    enabled: boolean,
    options: SimCfnResourceCallerOptions,
  ): Promise<void> {
    if (enabled) {
      return;
    }

    await this.kms.disableKey({ input: { KeyId: keyId } }, options);
  }
}
