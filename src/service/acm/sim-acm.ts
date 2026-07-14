import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
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
import { SimAcmCfnResourceFactory } from "./cfn/sim-cfn-acm-resource-factory.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";

export interface SimAcmRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimAcmProps {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated ACM. Handles SDK commands. Emulates AWS behaviour and state.
 */
export class SimAcm {
  public readonly certificates = new Map<SimArn, SimAcmCertificate>();

  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly background: BackgroundScheduler;
  private readonly cfnFactory = new SimAcmCfnResourceFactory({
    acm: this,
  });

  constructor(props: SimAcmProps = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = props;

    this.accountRegionScope = accountRegionScope;
    this.iam = iam;
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
    opts?: SimAcmRequestOptions,
  ): Promise<SimListCertificatesCommandOutput> {
    const handler = new ListCertificatesCommandHandler({
      certificates: this.certificates,
      iam: this.iam,
      background: this.background,
    });
    return await handler.handle(cmd, opts);
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

  /**
   * Get this service's CloudFormation Resource factory.
   */
  cfnResourceFactory(): SimAcmCfnResourceFactory {
    return this.cfnFactory;
  }
}
