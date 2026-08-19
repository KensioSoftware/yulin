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
} from "./request-certificate.command.js";
import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import { RequestCertificateAuthorizer } from "./request-certificate-authorizer.js";
import { RequestCertificateFactory } from "./request-cert-factory.js";
import { RequestCertificateValidator } from "./request-certificate-validator.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAcmCertificateValidation } from "../../validation/sim-acm-certificate-validation.js";

interface RequestCertificateCommandHandlerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly certificates: Map<SimArn, SimAcmCertificate>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly validation?: SimAcmCertificateValidation;
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
  private readonly validation: SimAcmCertificateValidation;
  private readonly validator = new RequestCertificateValidator();

  constructor(properties: RequestCertificateCommandHandlerProperties) {
    const {
      accountRegionScope,
      certificates,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      validation = new SimAcmCertificateValidation({ background }),
    } = properties;

    this.certificates = certificates;
    this.validation = validation;
    this.authorizer = new RequestCertificateAuthorizer({
      iam,
      resource: `arn:aws:acm:${accountRegionScope.regionName}:${accountRegionScope.accountId}:certificate/*`,
    });
    this.background = background;
    this.certificateFactory = new RequestCertificateFactory({
      accountRegionScope,
      clock: background,
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
    command: SimRequestCertificateCommand,
    options?: RequestCertificateCommandHandlerOptions,
  ): Promise<SimRequestCertificateCommandOutput> {
    this.validator.validate(command);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(options?.caller);

    const certificate = this.makeUntakenCertificate(command);
    const { certificateArn } = certificate;

    this.certificates.set(certificateArn, certificate);

    // Issuance waits on domain validation, which happens in the background.
    this.validation.begin(certificate);

    return {
      $metadata: {},
      CertificateArn: certificateArn,
    };
  }

  /**
   * Build the certificate, on an ARN no other certificate holds.
   *
   * ARNs are allocated from the number of certificates ACM holds, and a
   * registered certificate holds an ARN the simulation never allocated. One of
   * those can sit on the sequence number this count reaches, and stepping past
   * it keeps a requested certificate from replacing a registered one.
   */
  private makeUntakenCertificate(
    command: SimRequestCertificateCommand,
  ): SimAcmCertificate {
    let certificateCount = this.certificates.size;
    let certificate = this.certificateFactory.makeCertificate(
      command,
      certificateCount,
    );

    while (this.certificates.has(certificate.certificateArn)) {
      certificateCount += 1;
      certificate = this.certificateFactory.makeCertificate(
        command,
        certificateCount,
      );
    }

    return certificate;
  }
}
