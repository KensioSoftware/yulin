import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import {
  type SimAwsAccountRegionScope,
  simAwsAccountRegionScopeFactory,
} from "../aws/sim-aws-account-region-scope.js";
import type { SimArn } from "../aws/arn.js";
import type {
  SimRequestCertificateCommand,
  SimRequestCertificateCommandOutput,
} from "./command/request-certificate/request-certificate.cmd.js";
import { RequestCertificateCommandHandler } from "./command/request-certificate/request-certificate.handler.js";
import type { SimAcmCertificate } from "./certificate/sim-acm-certificate.js";
import type {
  SimDescribeCertificateCommand,
  SimDescribeCertificateCommandOutput,
} from "./command/describe-certificate/describe-certificate.cmd.js";
import { DescribeCertificateCommandHandler } from "./command/describe-certificate/describe-certificate.handler.js";
import type {
  SimListCertificatesCommand,
  SimListCertificatesCommandOutput,
} from "./command/list-certificates/list-certificates.cmd.js";
import { ListCertificatesCommandHandler } from "./command/list-certificates/list-certificates.handler.js";

interface SimAcmProps {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated ACM. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimAcm {
  public readonly certificates = new Map<SimArn, SimAcmCertificate>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;

  constructor(props: SimAcmProps = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
    } = props;

    this.accountRegionScope = accountRegionScope;
    this.background = background;
  }

  /**
   * Handle a Describe Certificate Command from the SDK.
   */
  async describeCertificate(
    cmd: SimDescribeCertificateCommand,
  ): Promise<SimDescribeCertificateCommandOutput> {
    const handler = new DescribeCertificateCommandHandler({
      certificates: this.certificates,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a List Certificates Command from the SDK.
   */
  async listCertificates(
    cmd: SimListCertificatesCommand,
  ): Promise<SimListCertificatesCommandOutput> {
    const handler = new ListCertificatesCommandHandler({
      certificates: this.certificates,
      background: this.background,
    });
    return await handler.handle(cmd);
  }

  /**
   * Handle a Request Certificate Command from the SDK.
   */
  async requestCertificate(
    cmd: SimRequestCertificateCommand,
  ): Promise<SimRequestCertificateCommandOutput> {
    const handler = new RequestCertificateCommandHandler({
      accountRegionScope: this.accountRegionScope,
      certificates: this.certificates,
      background: this.background,
    });
    return await handler.handle(cmd);
  }
}
