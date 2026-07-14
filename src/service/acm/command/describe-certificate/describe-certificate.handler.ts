import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import { SimAcmResourceNotFoundException } from "../../error/sim-acm.error.js";
import { DescribeCertificateAuthorizer } from "./describe-certificate-authorizer.js";
import type {
  SimDescribeCertificateCommand,
  SimDescribeCertificateCommandOutput,
} from "./describe-certificate.cmd.js";
import { SimAcmCertificateDetailFactory } from "./sim-acm-cert-detail-factory.js";

interface DescribeCertificateCommandHandlerProps {
  readonly certificates: Map<SimArn, SimAcmCertificate>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface DescribeCertificateCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly authorizer: DescribeCertificateAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly certificateDetailFactory =
    new SimAcmCertificateDetailFactory();

  constructor(props: DescribeCertificateCommandHandlerProps) {
    const {
      certificates,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = props;

    this.certificates = certificates;
    this.authorizer = new DescribeCertificateAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Describe a simulated ACM certificate.
   *
   * CertificateArn is validated before authorization because it is the resource
   * identifier used in the IAM decision. After sequencing, authorization happens
   * before the certificate store is read so unauthorized callers cannot learn
   * whether the requested ARN exists.
   */
  async handle(
    cmd: SimDescribeCertificateCommand,
    opts?: DescribeCertificateCommandHandlerOptions,
  ): Promise<SimDescribeCertificateCommandOutput> {
    assertDefined(
      cmd.input.CertificateArn,
      "DescribeCertificateCommand.input.CertificateArn required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(cmd.input.CertificateArn, opts?.caller);

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
