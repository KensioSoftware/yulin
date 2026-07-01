import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimArn } from "../../../aws/arn.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimRequestCertificateCommand,
  SimRequestCertificateCommandOutput,
} from "./request-certificate.cmd.js";
import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import {
  SimAcmInvalidArgsException,
  SimAcmTooManyTagsException,
} from "../../error/sim-acm.error.js";
import { RequestCertificateFactory } from "./request-cert-factory.js";

interface RequestCertificateCommandHandlerProps {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly certificates: Map<SimArn, SimAcmCertificate>;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated ACM RequestCertificateCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/acm/command/RequestCertificateCommand/
 */
export class RequestCertificateCommandHandler implements CommandHandler<
  SimRequestCertificateCommand,
  SimRequestCertificateCommandOutput
> {
  private readonly certificates: Map<SimArn, SimAcmCertificate>;
  private readonly background: BackgroundScheduler;
  private readonly certificateFactory: RequestCertificateFactory;

  constructor(props: RequestCertificateCommandHandlerProps) {
    const {
      accountRegionScope,
      certificates,
      background = new BackgroundTasks(),
    } = props;

    this.certificates = certificates;
    this.background = background;
    this.certificateFactory = new RequestCertificateFactory({
      accountRegionScope,
    });
  }

  /**
   * Request a simulated ACM certificate.
   */
  async handle(
    cmd: SimRequestCertificateCommand,
  ): Promise<SimRequestCertificateCommandOutput> {
    if (cmd.input.DomainName === undefined || cmd.input.DomainName === "") {
      throw new SimAcmInvalidArgsException(
        "RequestCertificateCommand.input.DomainName required",
      );
    }

    if ((cmd.input.Tags?.length ?? 0) > 50) {
      throw new SimAcmTooManyTagsException(
        "RequestCertificateCommand.input.Tags cannot contain more than 50 tags",
      );
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const certificate = this.certificateFactory.makeCertificate(
      cmd,
      this.certificates.size,
    );
    const { certificateArn } = certificate;

    this.certificates.set(certificateArn, certificate);

    // Schedule background task to issue the sim Certificate.
    this.background.schedule(() => certificate.issue());

    return {
      $metadata: {},
      CertificateArn: certificateArn,
    };
  }
}
