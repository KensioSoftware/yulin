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
import { RequestCertificateAuthorizer } from "./request-certificate-authorizer.js";
import { RequestCertificateFactory } from "./request-cert-factory.js";
import { RequestCertificateValidator } from "./request-certificate-validator.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";

interface RequestCertificateCommandHandlerProps {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly certificates: Map<SimArn, SimAcmCertificate>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface RequestCertificateCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
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
  private readonly authorizer: RequestCertificateAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly certificateFactory: RequestCertificateFactory;
  private readonly validator = new RequestCertificateValidator();

  constructor(props: RequestCertificateCommandHandlerProps) {
    const {
      accountRegionScope,
      certificates,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = props;

    this.certificates = certificates;
    this.authorizer = new RequestCertificateAuthorizer({
      iam,
      resource: `arn:aws:acm:${accountRegionScope.regionName}:${accountRegionScope.accountId}:certificate/*`,
    });
    this.background = background;
    this.certificateFactory = new RequestCertificateFactory({
      accountRegionScope,
    });
  }

  /**
   * Validate, authorize, create, and schedule issuance of a certificate.
   *
   * Validation precedes authorization so malformed SDK requests retain ACM's
   * client-error behavior. Authorization precedes factory use and Map mutation,
   * preventing an unauthorized caller from allocating certificate state or
   * scheduling a certificate issuance task.
   */
  async handle(
    cmd: SimRequestCertificateCommand,
    opts?: RequestCertificateCommandHandlerOptions,
  ): Promise<SimRequestCertificateCommandOutput> {
    this.validator.validate(cmd);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(opts?.caller);

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
