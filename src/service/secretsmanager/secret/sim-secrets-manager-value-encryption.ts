import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimSecretsManagerEncryptedValue } from "./sim-secrets-manager-encrypted-value.js";
import {
  secretsManagerDataKeySpec,
  secretsManagerDefaultKeyAlias,
  secretsManagerKmsViaService,
  type SimSecretsManagerKmsCrypto,
} from "./sim-secrets-manager-kms-crypto.js";
import { reportingKeyProblems } from "./sim-secrets-manager-kms-key-problems.js";
import type { SimSecretsManagerSecretValue } from "./sim-secrets-manager-secret-value.js";
import { SimSecretsManagerValueCipher } from "./sim-secrets-manager-value-cipher.js";

/**
 * What a secret version's encryption is bound to.
 *
 * Real Secrets Manager binds both the secret and the version, so a ciphertext
 * lifted out of one version cannot be decrypted as another, and a
 * `kms:EncryptionContext:SecretARN` policy condition matches on the secret it
 * belongs to.
 */
export interface SimSecretsManagerEncryptionBinding {
  readonly secretArn: string;
  readonly versionId: string;
}

interface SimSecretsManagerValueEncryptionProperties {
  readonly kms: SimSecretsManagerKmsCrypto;
}

/**
 * The KMS calls a secret version's value makes.
 *
 * The calls are made as the caller rather than as the service, which is what
 * puts a customer managed key's permissions in the way: a write needs the
 * caller's own `kms:GenerateDataKey` and a read needs `kms:Decrypt`, each on
 * top of the Secrets Manager permission for the secret itself. They are made
 * through the service as well, so the `aws/secretsmanager` managed key needs
 * no KMS permission at all, as on real AWS.
 */
export class SimSecretsManagerValueEncryption {
  private readonly kms: SimSecretsManagerKmsCrypto;
  private readonly cipher = new SimSecretsManagerValueCipher();

  constructor(properties: SimSecretsManagerValueEncryptionProperties) {
    this.kms = properties.kms;
  }

  /**
   * Encrypt a value as a new version, under the secret's key.
   */
  async encrypt(
    binding: SimSecretsManagerEncryptionBinding,
    value: SimSecretsManagerSecretValue,
    keyId: string | undefined,
    caller: SimAwsCaller | undefined,
  ): Promise<SimSecretsManagerEncryptedValue> {
    const dataKey = await reportingKeyProblems(
      "encrypting",
      async () =>
        await this.kms.generateDataKey(
          {
            input: {
              KeyId: keyId ?? secretsManagerDefaultKeyAlias,
              KeySpec: secretsManagerDataKeySpec,
              EncryptionContext: this.contextFor(binding),
            },
          },
          { caller, viaService: secretsManagerKmsViaService },
        ),
    );

    assertDefined(
      dataKey.Plaintext,
      `Simulated KMS generated no data key for ${binding.secretArn}`,
    );
    assertDefined(
      dataKey.CiphertextBlob,
      `Simulated KMS encrypted no data key for ${binding.secretArn}`,
    );

    return this.cipher.seal(value, dataKey.Plaintext, dataKey.CiphertextBlob);
  }

  /**
   * Decrypt a stored version, which needs the same binding it was made with.
   */
  async decrypt(
    binding: SimSecretsManagerEncryptionBinding,
    encrypted: SimSecretsManagerEncryptedValue,
    caller: SimAwsCaller | undefined,
  ): Promise<SimSecretsManagerSecretValue> {
    const dataKey = await reportingKeyProblems(
      "decrypting",
      async () =>
        await this.kms.decrypt(
          {
            input: {
              CiphertextBlob: encrypted.dataKeyCiphertext,
              EncryptionContext: this.contextFor(binding),
            },
          },
          { caller, viaService: secretsManagerKmsViaService },
        ),
    );

    assertDefined(
      dataKey.Plaintext,
      `Simulated KMS recovered no data key for ${binding.secretArn}`,
    );

    return this.cipher.open(encrypted, dataKey.Plaintext);
  }

  private contextFor(
    binding: SimSecretsManagerEncryptionBinding,
  ): Readonly<Record<string, string>> {
    return {
      SecretARN: binding.secretArn,
      SecretVersionId: binding.versionId,
    };
  }
}
