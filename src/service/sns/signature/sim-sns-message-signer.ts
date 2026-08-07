import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { simSnsHost } from "./sim-sns-host.js";
import { SimSnsSigningKey } from "./sim-sns-signing-key.js";

/**
 * The signature version real SNS signs with unless a topic opts into version 2.
 *
 * Version 1 is SHA1withRSA. The `SignatureVersion` topic attribute, which is
 * how a real topic asks for version 2, is refused here, so every message
 * carries this.
 */
export const simSnsSignatureVersion = "1";

/**
 * What a signature adds to a delivered message.
 */
export interface SimSnsSignatureFields {
  readonly SignatureVersion: string;
  readonly Signature: string;
  readonly SigningCertURL: string;
}

interface SimSnsMessageSignerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Signs the messages one simulated SNS scope delivers.
 *
 * The key belongs to the scope rather than to a topic, which is how real SNS
 * works: one certificate per Region signs every message that Region sends. It
 * is generated on first use, because generating RSA takes long enough to
 * notice and a scope that never delivers anything never needs one.
 */
export class SimSnsMessageSigner {
  private readonly host: string;
  private held: SimSnsSigningKey | undefined;

  constructor(properties: SimSnsMessageSignerProperties) {
    this.host = simSnsHost(properties.accountRegionScope.regionName);
  }

  /**
   * Sign the canonical form of one message.
   */
  sign(canonicalMessage: string): SimSnsSignatureFields {
    const key = this.key();

    return {
      SignatureVersion: simSnsSignatureVersion,
      Signature: key.sign(canonicalMessage),
      SigningCertURL: this.certificateUrl(key),
    };
  }

  /**
   * The certificate a `SigningCertURL` names, or nothing when it names another.
   *
   * This is how a verifier gets at the certificate, because the URL cannot be
   * fetched: simulated SNS is not served over HTTP. A URL this scope did not
   * issue answers with nothing rather than with the certificate it has, so a
   * message signed by another scope is not accidentally verified against the
   * wrong key.
   */
  certificateFor(signingCertUrl: string): string | undefined {
    const key = this.held;

    if (key === undefined || this.certificateUrl(key) !== signingCertUrl) {
      return undefined;
    }

    return key.certificatePem;
  }

  private certificateUrl(key: SimSnsSigningKey): string {
    return `https://${this.host}/SimulatedNotificationService-${key.fingerprint}.pem`;
  }

  private key(): SimSnsSigningKey {
    this.held ??= SimSnsSigningKey.generate(this.host);

    return this.held;
  }
}
