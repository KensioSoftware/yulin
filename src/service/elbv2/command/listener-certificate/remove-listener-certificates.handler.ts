import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { simElbV2CertificateArns } from "../../listener/certificate/sim-elbv2-certificate-arns.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimRemoveListenerCertificatesCommand,
  SimRemoveListenerCertificatesCommandOutput,
} from "./listener-certificate.command.js";

/**
 * Simulated ELBv2 RemoveListenerCertificatesCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_RemoveListenerCertificates.html
 */
export class RemoveListenerCertificatesCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimRemoveListenerCertificatesCommand,
      SimRemoveListenerCertificatesCommandOutput
    >
{
  /**
   * Stop a listener carrying certificates.
   *
   * The certificates are not looked for in simulated ACM, only in the
   * listener's own list: a certificate that has stopped being an issued one is
   * exactly the certificate someone would be taking off a listener.
   */
  async handle(
    command: SimRemoveListenerCertificatesCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimRemoveListenerCertificatesCommandOutput> {
    const { input } = command;

    if (input.ListenerArn === undefined) {
      throw new SimElbV2ValidationError("ListenerArn is required");
    }

    const certificateArns = simElbV2CertificateArns(
      input.Certificates,
      "Certificates",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(
      "RemoveListenerCertificates",
      input.ListenerArn,
      options,
    );

    this.stores.listeners
      .requireByArn(input.ListenerArn)
      .removeCertificates(certificateArns);

    return { $metadata: {} };
  }
}
