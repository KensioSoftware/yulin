import type { SimArn } from "../../../aws/arn.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import type {
  SimDescribeCertificateCommand,
  SimDescribeCertificateCommandOutput,
} from "./describe-certificate.cmd.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimAcmResourceNotFoundException } from "../../error/sim-acm.error.js";
import { SimAcmCertificateDetailFactory } from "./sim-acm-cert-detail-factory.js";

interface DescribeCertificateCommandHandlerProps {
  readonly certificates: Map<SimArn, SimAcmCertificate>;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated ACM DescribeCertificateCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/acm/command/DescribeCertificateCommand/
 */
export class DescribeCertificateCommandHandler implements CommandHandler<
  SimDescribeCertificateCommand,
  SimDescribeCertificateCommandOutput
> {
  private readonly certificates: Map<SimArn, SimAcmCertificate>;
  private readonly background: BackgroundScheduler;
  private readonly certificateDetailFactory =
    new SimAcmCertificateDetailFactory();

  constructor(props: DescribeCertificateCommandHandlerProps) {
    const { certificates, background = new BackgroundTasks() } = props;

    this.certificates = certificates;
    this.background = background;
  }

  /**
   * Describe a simulated ACM certificate.
   */
  async handle(
    cmd: SimDescribeCertificateCommand,
  ): Promise<SimDescribeCertificateCommandOutput> {
    assertDefined(
      cmd.input.CertificateArn,
      "DescribeCertificateCommand.input.CertificateArn required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const certificate = this.certificates.get(
      cmd.input.CertificateArn as SimArn,
    );
    if (certificate === undefined) {
      throw new SimAcmResourceNotFoundException(
        `No sim ACM Certificate with ARN ${cmd.input.CertificateArn}`,
      );
    }

    return {
      $metadata: {},
      Certificate: this.certificateDetailFactory.make(certificate),
    };
  }
}
