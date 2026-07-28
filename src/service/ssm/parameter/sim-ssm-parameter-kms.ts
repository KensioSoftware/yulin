import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { reportingKeyProblems } from "./sim-ssm-kms-key-problems.js";
import {
  ssmDefaultKeyAlias,
  type SimSsmKmsCrypto,
} from "./sim-ssm-kms-crypto.js";

/**
 * The encryption context key Parameter Store binds every SecureString value
 * to, holding the ARN of the parameter being encrypted.
 *
 * Binding it means a ciphertext lifted out of one parameter cannot be
 * decrypted as another, and it is what a `kms:EncryptionContext:PARAMETER_ARN`
 * policy condition matches on real AWS.
 */
const parameterArnContextKey = "PARAMETER_ARN";

/**
 * What KMS produced for one parameter value.
 */
export interface SimSsmParameterCiphertext {
  readonly ciphertext: string;
  readonly keyId: string | undefined;
}

interface SimSsmParameterKmsProperties {
  readonly kms: SimSsmKmsCrypto;
}

/**
 * The KMS calls a SecureString parameter makes.
 *
 * The calls are made as the caller rather than as the service, which is the
 * point: a standard tier write needs `kms:Encrypt` on the key and a decrypting
 * read needs `kms:Decrypt`, each on top of the SSM permission for the
 * parameter itself.
 *
 * Standard tier Parameter Store encrypts under the key directly rather than
 * through a data key, so this is one Encrypt and one Decrypt and nothing more.
 */
export class SimSsmParameterKms {
  private readonly kms: SimSsmKmsCrypto;

  constructor(properties: SimSsmParameterKmsProperties) {
    this.kms = properties.kms;
  }

  /**
   * Encrypt a parameter value, bound to the ARN of the parameter holding it.
   */
  async encrypt(
    parameterArn: string,
    plaintext: string,
    keyId: string | undefined,
    caller: SimAwsCaller | undefined,
  ): Promise<SimSsmParameterCiphertext> {
    const encrypted = await reportingKeyProblems(
      async () =>
        await this.kms.encrypt(
          {
            input: {
              KeyId: keyId ?? ssmDefaultKeyAlias,
              Plaintext: Buffer.from(plaintext, "utf8"),
              EncryptionContext: this.contextFor(parameterArn),
            },
          },
          { caller },
        ),
    );

    assertDefined(
      encrypted.CiphertextBlob,
      `Simulated KMS encrypted ${parameterArn} to nothing`,
    );

    return {
      ciphertext: Buffer.from(encrypted.CiphertextBlob).toString("base64"),
      keyId: encrypted.KeyId,
    };
  }

  /**
   * Decrypt a parameter value, which needs the same binding it was made with.
   */
  async decrypt(
    parameterArn: string,
    ciphertext: string,
    caller: SimAwsCaller | undefined,
  ): Promise<string> {
    const decrypted = await reportingKeyProblems(
      async () =>
        await this.kms.decrypt(
          {
            input: {
              CiphertextBlob: Buffer.from(ciphertext, "base64"),
              EncryptionContext: this.contextFor(parameterArn),
            },
          },
          { caller },
        ),
    );

    assertDefined(
      decrypted.Plaintext,
      `Simulated KMS decrypted ${parameterArn} to nothing`,
    );

    return Buffer.from(decrypted.Plaintext).toString("utf8");
  }

  private contextFor(parameterArn: string): Readonly<Record<string, string>> {
    return { [parameterArnContextKey]: parameterArn };
  }
}
