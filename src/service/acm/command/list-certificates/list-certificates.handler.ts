import type { SimArn } from "../../../aws/arn.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import { SimAcmInvalidArgsException } from "../../error/sim-acm.error.js";
import type {
  SimAcmCertificateSummary,
  SimListCertificatesCommand,
  SimListCertificatesCommandOutput,
} from "./list-certificates.cmd.js";

interface ListCertificatesCommandHandlerProps {
  readonly certificates: Map<SimArn, SimAcmCertificate>;
  readonly background?: BackgroundScheduler;
}

const defaultMaxItems = 100;
const maxMaxItems = 1000;

/**
 * Simulated ACM ListCertificatesCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/acm/command/ListCertificatesCommand/
 */
export class ListCertificatesCommandHandler implements CommandHandler<
  SimListCertificatesCommand,
  SimListCertificatesCommandOutput
> {
  private readonly certificates: Map<SimArn, SimAcmCertificate>;
  private readonly background: BackgroundScheduler;

  constructor(props: ListCertificatesCommandHandlerProps) {
    const { certificates, background = new BackgroundTasks() } = props;

    this.certificates = certificates;
    this.background = background;
  }

  /**
   * List simulated ACM certificates.
   */
  async handle(
    cmd: SimListCertificatesCommand,
  ): Promise<SimListCertificatesCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const maxItems = this.getMaxItems(cmd);
    const startIndex = this.getStartIndex(cmd);
    const certificates = [...this.certificates.values()].filter(
      (certificate) =>
        cmd.input.CertificateStatuses === undefined
          ? true
          : cmd.input.CertificateStatuses.includes(certificate.status),
    );

    const page = certificates.slice(startIndex, startIndex + maxItems);
    const nextIndex = startIndex + maxItems;

    return {
      $metadata: {},
      CertificateSummaryList: page.map((certificate) =>
        this.makeCertificateSummary(certificate),
      ),
      NextToken:
        nextIndex < certificates.length ? String(nextIndex) : undefined,
    };
  }

  private getMaxItems(cmd: SimListCertificatesCommand): number {
    const maxItems = cmd.input.MaxItems ?? defaultMaxItems;

    if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > maxMaxItems) {
      throw new SimAcmInvalidArgsException(
        "ListCertificatesCommand.input.MaxItems must be an integer between 1 and 1000",
      );
    }

    return maxItems;
  }

  private getStartIndex(cmd: SimListCertificatesCommand): number {
    if (cmd.input.NextToken === undefined) {
      return 0;
    }

    const startIndex = Number(cmd.input.NextToken);

    if (
      !Number.isInteger(startIndex) ||
      startIndex < 0 ||
      String(startIndex) !== cmd.input.NextToken
    ) {
      throw new SimAcmInvalidArgsException(
        "ListCertificatesCommand.input.NextToken is invalid",
      );
    }

    return startIndex;
  }

  private makeCertificateSummary(
    certificate: SimAcmCertificate,
  ): SimAcmCertificateSummary {
    return {
      CertificateArn: certificate.certificateArn,
      DomainName: certificate.domainName,
      SubjectAlternativeNameSummaries:
        certificate.subjectAlternativeNames.slice(0, 100),
      HasAdditionalSubjectAlternativeNames:
        certificate.subjectAlternativeNames.length > 100,
      Status: certificate.status,
      Type: "TEST_ISSUED",
      KeyAlgorithm: "RSA-2048",
      InUse: false,
      CreatedAt: certificate.createdAt,
      IssuedAt: certificate.issuedAt,
    };
  }
}
