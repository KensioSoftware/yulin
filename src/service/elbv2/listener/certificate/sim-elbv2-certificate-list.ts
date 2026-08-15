import type { SimElbV2Certificate } from "../../command/sim-elbv2-shared.command.js";
import { SimElbV2OperationNotPermittedException } from "../../error/sim-elbv2.error.js";

/**
 * The certificates one listener carries.
 *
 * A listener has one default certificate and any number of additional ones,
 * and the two are held apart here because everything that can be asked about a
 * certificate list depends on which of the two a certificate is: the default is
 * the one a described listener reports, the one `ModifyListener` replaces, and
 * the one `RemoveListenerCertificates` will not take away.
 *
 * The additional ones are a set rather than a list, because adding a
 * certificate already on a listener is a request real ELB answers successfully
 * without carrying it twice.
 */
export class SimElbV2CertificateList {
  #defaultArn: string | undefined;
  readonly #additional = new Set<string>();

  /** The ARN of the certificate this listener presents by default. */
  get defaultArn(): string | undefined {
    return this.#defaultArn;
  }

  /**
   * Replace the default certificate.
   *
   * A certificate that was an additional one becomes the default rather than
   * appearing twice, which is what real ELB reports for the same listener.
   */
  setDefault(arn: string): void {
    this.#defaultArn = arn;
    this.#additional.delete(arn);
  }

  /**
   * Forget every certificate, which is what leaving HTTPS does to a listener.
   */
  clear(): void {
    this.#defaultArn = undefined;
    this.#additional.clear();
  }

  /**
   * Carry more certificates beyond the default one.
   */
  add(arns: readonly string[]): void {
    for (const arn of arns) {
      if (arn !== this.#defaultArn) {
        this.#additional.add(arn);
      }
    }
  }

  /**
   * Stop carrying certificates, refusing to take away the default one.
   */
  remove(arns: readonly string[]): void {
    for (const arn of arns) {
      this.removeOne(arn);
    }
  }

  /**
   * The whole list, which is what `DescribeListenerCertificates` reports.
   *
   * The default comes first and is the only one flagged as such, so a reader
   * can tell which certificate the listener would present to a client that
   * asked for no particular host name.
   */
  list(): readonly SimElbV2Certificate[] {
    const additional = [...this.#additional].map((arn) => ({
      CertificateArn: arn,
      IsDefault: false,
    }));

    if (this.#defaultArn === undefined) {
      return additional;
    }

    return [
      { CertificateArn: this.#defaultArn, IsDefault: true },
      ...additional,
    ];
  }

  /**
   * The default certificate alone, which is what a described listener reports.
   *
   * Real ELB reports only the default in a listener's own `Certificates`, and
   * the rest through `DescribeListenerCertificates`.
   */
  defaultOnly(): readonly SimElbV2Certificate[] {
    if (this.#defaultArn === undefined) {
      return [];
    }

    return [{ CertificateArn: this.#defaultArn, IsDefault: true }];
  }

  private removeOne(arn: string): void {
    if (arn === this.#defaultArn) {
      throw new SimElbV2OperationNotPermittedException(
        `Certificate ${arn} is the default certificate of this listener, ` +
          `which is replaced with ModifyListener rather than removed`,
      );
    }

    this.#additional.delete(arn);
  }
}
