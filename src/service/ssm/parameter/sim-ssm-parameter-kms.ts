import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { reportingKeyProblems } from "./sim-ssm-kms-key-problems.js";
import {
  ssmDefaultKeyAlias,
  ssmKmsViaService,
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
 * The calls are made as the caller rather than as the service. Under a
 * customer managed key a standard tier write needs `kms:Encrypt` on the key
 * and a decrypting read needs `kms:Decrypt`, each on top of the SSM permission
 * for the parameter itself.
 *
 * They are also made through the service, and passing through it is what
 * reaches the `aws/ssm` managed key at all. That key's policy allows the
 * cryptographic actions to a wildcard principal under `kms:ViaService` and
 * `kms:CallerAccount` conditions, and Parameter Store supplies the first of
 * them. A grant of that shape delegates nothing to IAM, and it admits the
 * request by itself. A Role holding `ssm:GetParameter` and nothing on KMS
 * reads the decrypted value, as it does in an account. A caller in another
 * Account fails the `kms:CallerAccount` condition, and a caller reaching KMS
 * directly carries no `kms:ViaService` for the policy to match.
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
          { caller, viaService: ssmKmsViaService },
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
          { caller, viaService: ssmKmsViaService },
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
