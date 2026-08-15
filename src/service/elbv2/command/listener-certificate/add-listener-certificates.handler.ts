import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { simElbV2CertificateArns } from "../../listener/certificate/sim-elbv2-certificate-arns.js";
import type { SimElbV2CertificateResolver } from "../../listener/certificate/sim-elbv2-certificate-resolver.js";
import {
  SimElbV2CommandHandler,
  type SimElbV2CommandHandlerProperties,
} from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimAddListenerCertificatesCommand,
  SimAddListenerCertificatesCommandOutput,
} from "./listener-certificate.command.js";

interface AddListenerCertificatesCommandHandlerProperties extends SimElbV2CommandHandlerProperties {
  readonly certificates: SimElbV2CertificateResolver;
}

/**
 * Simulated ELBv2 AddListenerCertificatesCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_AddListenerCertificates.html
 */
export class AddListenerCertificatesCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimAddListenerCertificatesCommand,
      SimAddListenerCertificatesCommandOutput
    >
{
  private readonly certificates: SimElbV2CertificateResolver;

  constructor(properties: AddListenerCertificatesCommandHandlerProperties) {
    super(properties);
    this.certificates = properties.certificates;
  }

  /**
   * Carry more certificates on a listener, beyond its default one.
   *
   * `IsDefault` is read from none of them, which is what real ELB documents:
   * the default certificate is the one `ModifyListener` names, and this
   * operation is the rest of the list.
   */
  async handle(
    command: SimAddListenerCertificatesCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimAddListenerCertificatesCommandOutput> {
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
      "AddListenerCertificates",
      input.ListenerArn,
      options,
    );

    const listener = this.stores.listeners.requireByArn(input.ListenerArn);

    this.certificates.requireAllIssued(certificateArns);
    listener.addCertificates(certificateArns);

    return { $metadata: {}, Certificates: listener.certificates };
  }
}
