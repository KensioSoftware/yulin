import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAcmCertificate } from "../../certificate/sim-acm-certificate.js";
import { SimAcmResourceNotFoundException } from "../../error/sim-acm.error.js";
import { DeleteCertificateAuthorizer } from "./delete-certificate-authorizer.js";
import type {
  SimDeleteCertificateCommand,
  SimDeleteCertificateCommandOutput,
} from "./delete-certificate.command.js";

interface DeleteCertificateCommandHandlerProperties {
  readonly certificates: Map<SimArn, SimAcmCertificate>;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

interface DeleteCertificateCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated ACM DeleteCertificateCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/acm/command/DeleteCertificateCommand/
 */
export class DeleteCertificateCommandHandler implements CommandHandler<
  SimDeleteCertificateCommand,
  SimDeleteCertificateCommandOutput
> {
  private readonly certificates: Map<SimArn, SimAcmCertificate>;
  private readonly authorizer: DeleteCertificateAuthorizer;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteCertificateCommandHandlerProperties) {
    const {
      certificates,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.certificates = certificates;
    this.authorizer = new DeleteCertificateAuthorizer({ iam });
    this.background = background;
  }

  /**
   * Delete a simulated ACM certificate.
   *
   * Real ACM refuses with ResourceInUseException while anything is using the
   * certificate, and reports what through the certificate's InUseBy list. This
   * simulation does not track use: nothing tells ACM when a CloudFront
   * distribution or a load balancer takes a certificate up, so InUseBy is
   * always empty and every certificate here is deletable. A test that expects
   * the in-use refusal will not get it.
   */
  async handle(
    command: SimDeleteCertificateCommand,
    options?: DeleteCertificateCommandHandlerOptions,
  ): Promise<SimDeleteCertificateCommandOutput> {
    assertDefined(
      command.input.CertificateArn,
      "DeleteCertificateCommand.input.CertificateArn required",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(command.input.CertificateArn, options?.caller);

    const certificateArn = command.input.CertificateArn as SimArn;

    if (!this.certificates.delete(certificateArn)) {
      throw new SimAcmResourceNotFoundException(
        `No sim ACM Certificate with ARN ${certificateArn}`,
      );
    }

    return { $metadata: {} };
  }
}
