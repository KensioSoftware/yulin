import type { SimArn } from "../../../aws/arn.js";
import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import { SimAcmInvalidArgsException } from "../../error/sim-acm.error.js";
import type {
  SimAcmCertificateSummary,
  SimListCertificatesCommandInput,
  SimListCertificatesCommandOutput,
} from "./list-certificates.cmd.js";

interface ListCertificatesPageBuilderProps {
  readonly certificates: ReadonlyMap<SimArn, SimAcmCertificate>;
}

type ListCertificatesPage = Omit<SimListCertificatesCommandOutput, "$metadata">;

const defaultMaxItems = 100;
const maxMaxItems = 1000;

/**
 * Builds one page of an ACM ListCertificates response.
 *
 * IAM authorization remains in the command handler because it determines
 * whether certificate state may be read at all. This class handles the data
 * operations that happen after authorization: request validation, status
 * filtering, continuation-token interpretation, page selection, and conversion
 * of certificates into SDK response summaries.
 *
 * Certificates retain the insertion order of the service's Map. Requesting a
 * certificate inserts it into that Map, so this preserves creation order across
 * filtered and paginated responses.
 *
 * Continuation tokens are numeric offsets into the filtered certificate
 * collection. The offset format matches the previous handler behavior and
 * allows the next request to resume immediately after the preceding page.
 */
export class ListCertificatesPageBuilder {
  private readonly certificates: ReadonlyMap<SimArn, SimAcmCertificate>;

  constructor(props: ListCertificatesPageBuilderProps) {
    this.certificates = props.certificates;
  }

  /**
   * Build the response fields for one ListCertificates page.
   *
   * Response metadata belongs to the command handler and is omitted here. This
   * keeps transport-level response concerns separate from certificate filtering
   * and pagination.
   *
   * MaxItems and NextToken are validated before certificate state is traversed.
   * After validation, the complete status-matched collection is produced so the
   * next token can be based on the same collection used to select the page.
   */
  build(input: SimListCertificatesCommandInput): ListCertificatesPage {
    const maxItems = this.maxItems(input.MaxItems);
    const startIndex = this.startIndex(input.NextToken);
    const matchingCertificates = this.matchingCertificates(
      input.CertificateStatuses,
    );
    const page = matchingCertificates.slice(startIndex, startIndex + maxItems);

    return {
      CertificateSummaryList: page.map((certificate) =>
        this.certificateSummary(certificate),
      ),
      NextToken: this.nextToken(
        startIndex,
        maxItems,
        matchingCertificates.length,
      ),
    };
  }

  /**
   * Validate and normalize the requested page size.
   *
   * ACM defaults MaxItems to 100. Values outside the supported range, including
   * fractions and non-finite numbers, are rejected rather than being passed to
   * Array.prototype.slice and normalized by JavaScript.
   */
  private maxItems(requestedMaxItems?: number): number {
    const maxItems = requestedMaxItems ?? defaultMaxItems;

    if (
      !Number.isSafeInteger(maxItems) ||
      maxItems < 1 ||
      maxItems > maxMaxItems
    ) {
      throw new SimAcmInvalidArgsException(
        "ListCertificatesCommand.input.MaxItems must be an integer between 1 and 1000",
      );
    }

    return maxItems;
  }

  /**
   * Convert a continuation token into its filtered-collection offset.
   *
   * Tokens must use the canonical non-negative integer representation emitted
   * by this class. The string round-trip rejects forms such as decimals,
   * whitespace, signs, exponential notation, and leading zeroes.
   */
  private startIndex(nextToken?: string): number {
    if (nextToken === undefined) {
      return 0;
    }

    const startIndex = Number(nextToken);

    if (
      !Number.isSafeInteger(startIndex) ||
      startIndex < 0 ||
      String(startIndex) !== nextToken
    ) {
      throw new SimAcmInvalidArgsException(
        "ListCertificatesCommand.input.NextToken is invalid",
      );
    }

    return startIndex;
  }

  /**
   * Return certificates whose status is included by the request.
   *
   * Omitting CertificateStatuses includes every certificate. Filtering an array
   * copied from the Map leaves service state unchanged and preserves insertion
   * order among the matching certificates.
   */
  private matchingCertificates(
    statuses: SimListCertificatesCommandInput["CertificateStatuses"],
  ): SimAcmCertificate[] {
    const certificates = this.certificates.values().toArray();

    return statuses === undefined
      ? certificates
      : certificates.filter((certificate) =>
          statuses.includes(certificate.status),
        );
  }

  /**
   * Return the next filtered-collection offset when another item remains.
   *
   * The next offset advances by MaxItems rather than by the current page length.
   * This retains the established token representation. No token is returned for
   * the final page or for a request whose starting offset is past the end.
   */
  private nextToken(
    startIndex: number,
    maxItems: number,
    matchingCertificateCount: number,
  ): string | undefined {
    const nextIndex = startIndex + maxItems;

    return nextIndex < matchingCertificateCount ? String(nextIndex) : undefined;
  }

  /**
   * Convert internal certificate state into the fields returned by ACM.
   *
   * ACM returns at most 100 subject alternative name summaries. The additional
   * names flag tells the caller whether the source certificate contains entries
   * beyond that response limit.
   */
  private certificateSummary(
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
