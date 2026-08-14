import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimSsmValidationException } from "../error/sim-ssm.error.js";
import type { SimSsmParameter } from "./sim-ssm-parameter.js";
import type { SimSsmKmsCrypto } from "./sim-ssm-kms-crypto.js";
import { SimSsmParameterKms } from "./sim-ssm-parameter-kms.js";
import type { SimSsmParameterType } from "./sim-ssm-parameter-type.js";
import { SimSsmParameterValue } from "./sim-ssm-parameter-value.js";
import type { SimSsmParameterVersion } from "./sim-ssm-parameter-version.js";

interface SimSsmParameterEncryptionProperties {
  readonly kms: SimSsmKmsCrypto;
}

/**
 * What a SecureString value is stored as, and which key protects it.
 */
export interface SimSsmEncryptedValue {
  readonly value: SimSsmParameterValue;
  readonly keyId: string | undefined;
}

/**
 * Decides when a parameter value is encrypted and when it is decrypted.
 *
 * These rules are worth keeping apart from the KMS calls themselves, because
 * they are what a caller actually trips over: a value stored in the clear
 * because the type said so, and a read that gets a ciphertext back because it
 * did not ask for decryption.
 */
export class SimSsmParameterEncryption {
  private readonly kms: SimSsmParameterKms;

  constructor(properties: SimSsmParameterEncryptionProperties) {
    this.kms = new SimSsmParameterKms(properties);
  }

  /**
   * The stored form of a submitted value, encrypted if the type calls for it.
   */
  async stored(
    type: SimSsmParameterType,
    parameterArn: string,
    submitted: SimSsmParameterValue,
    keyId: string | undefined,
    caller: SimAwsCaller | undefined,
  ): Promise<SimSsmEncryptedValue> {
    if (!type.isSecure) {
      this.refuseKeyIdWithoutSecureString(type, keyId);

      return { value: submitted, keyId: undefined };
    }

    const encrypted = await this.kms.encrypt(
      parameterArn,
      submitted.value,
      keyId,
      caller,
    );

    return {
      value: SimSsmParameterValue.encrypted(encrypted.ciphertext),
      keyId: encrypted.keyId,
    };
  }

  /**
   * The value a read reports, decrypted only when it was asked for.
   *
   * `WithDecryption` on a parameter that is not encrypted is ignored rather
   * than refused, as real Parameter Store ignores it.
   */
  async reported(
    parameter: SimSsmParameter,
    version: SimSsmParameterVersion,
    withDecryption: boolean | undefined,
    caller: SimAwsCaller | undefined,
  ): Promise<string> {
    if (withDecryption !== true || !parameter.type.isSecure) {
      return version.value.value;
    }

    return await this.kms.decrypt(
      parameter.arn.value,
      version.value.value,
      caller,
    );
  }

  private refuseKeyIdWithoutSecureString(
    type: SimSsmParameterType,
    keyId: string | undefined,
  ): void {
    if (keyId === undefined) {
      return;
    }

    throw new SimSsmValidationException(
      `KeyId applies to a SecureString parameter, and this one is a ` +
        `${type.value} parameter. A value stored in the clear is not ` +
        `encrypted with anything.`,
    );
  }
}
