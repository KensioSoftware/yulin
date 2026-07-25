import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimArn } from "../aws/arn.js";
import type {
  SimRequestCertificateCommand,
  SimRequestCertificateCommandOutput,
} from "./command/request-certificate/request-certificate.command.js";
import { RequestCertificateCommandHandler } from "./command/request-certificate/request-certificate.handler.js";
import type { SimAcmCertificate } from "./certificate/sim-acm-certificate.js";
import type {
  SimDescribeCertificateCommand,
  SimDescribeCertificateCommandOutput,
} from "./command/describe-certificate/describe-certificate.command.js";
import { DescribeCertificateCommandHandler } from "./command/describe-certificate/describe-certificate.handler.js";
import type {
  SimListCertificatesCommand,
  SimListCertificatesCommandOutput,
} from "./command/list-certificates/list-certificates.command.js";
import { ListCertificatesCommandHandler } from "./command/list-certificates/list-certificates.handler.js";
import { SimAcmCfnResourceFactory } from "./cfn/sim-cfn-acm-resource-factory.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimAcmSdkCommandRouter } from "./sdk/sim-acm-sdk-command-router.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import { SimAcmCertificateValidation } from "./validation/sim-acm-certificate-validation.js";
import { SimAcmDnsValidationCompleter } from "./validation/sim-acm-dns-validation-completer.js";
import type { SimAcmDnsRecords } from "./validation/sim-acm-dns-records.js";

export interface SimAcmRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimAcmProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly dnsRecords?: SimAcmDnsRecords;
}

/**
 * Simulated ACM. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimAcm {
  public readonly certificates = new Map<SimArn, SimAcmCertificate>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly background: BackgroundScheduler;
  private readonly validation: SimAcmCertificateValidation;
  private readonly dnsValidationCompleter: SimAcmDnsValidationCompleter;
  private readonly cfnFactory = new SimAcmCfnResourceFactory({
    acm: this,
  });
  private readonly sdkRouter = new SimAcmSdkCommandRouter(this);

  constructor(properties: SimAcmProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      dnsRecords,
    } = properties;

    this.accountRegionScope = accountRegionScope;
    this.iam = iam;
    this.background = background;
    this.validation = new SimAcmCertificateValidation({
      background,
      dnsRecords,
    });
    this.dnsValidationCompleter = new SimAcmDnsValidationCompleter({
      certificates: this.certificates,
      validation: this.validation,
      dnsRecords,
    });
  }

  /**
   * Always require a DNS validation record before issuing a Certificate, even
   * where no sim Route53 Hosted Zone covers the domain name.
   */
  requireDnsValidation(): this {
    this.validation.alwaysRequireDnsValidation();
    return this;
  }

  /**
   * Never require a DNS validation record: issue every Certificate as soon as
   * it is requested, whatever sim Route53 holds.
   */
  autoIssueCertificates(): this {
    this.validation.neverRequireDnsValidation();
    return this;
  }

  /**
   * Create the DNS validation records a pending sim Certificate is waiting on.
   *
   * This is a simulator convenience for tests that want a realistic issuance
   * flow without publishing each validation CNAME by hand. The Certificate is
   * issued by the time this resolves.
   */
  async completeDnsValidation(
    certificateArn: string | undefined,
  ): Promise<void> {
    await this.dnsValidationCompleter.complete(certificateArn);
  }

  /**
   * Re-check a sim Certificate against DNS now, issuing it if it is validated.
   *
   * This publishes nothing. It is for callers that have already created the
   * validation records themselves, such as CloudFormation.
   * @internal
   */
  async settleCertificateValidation(
    certificate: SimAcmCertificate,
  ): Promise<void> {
    await this.validation.settle(certificate);
  }

  /**
   * Handle a Describe Certificate Command from the SDK.
   */
  async describeCertificate(
    command: SimDescribeCertificateCommand,
    options?: SimAcmRequestOptions,
  ): Promise<SimDescribeCertificateCommandOutput> {
    const handler = new DescribeCertificateCommandHandler({
      certificates: this.certificates,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle a List Certificates Command from the SDK.
   */
  async listCertificates(
    command: SimListCertificatesCommand,
    options?: SimAcmRequestOptions,
  ): Promise<SimListCertificatesCommandOutput> {
    const handler = new ListCertificatesCommandHandler({
      certificates: this.certificates,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(command, options);
  }

  /**
   * Handle a Request Certificate Command from the SDK.
   */
  async requestCertificate(
    command: SimRequestCertificateCommand,
    options?: SimAcmRequestOptions,
  ): Promise<SimRequestCertificateCommandOutput> {
    const handler = new RequestCertificateCommandHandler({
      accountRegionScope: this.accountRegionScope,
      certificates: this.certificates,
      iam: this.iam,
      background: this.background,
      validation: this.validation,
    });
    return await handler.handle(command, options);
  }

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimAcmCfnResourceFactory {
    return this.cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
