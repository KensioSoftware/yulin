import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import { SimElbV2Page } from "../sim-elbv2-page.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimDescribeListenerCertificatesCommand,
  SimDescribeListenerCertificatesCommandOutput,
} from "./listener-certificate.command.js";

/**
 * Simulated ELBv2 DescribeListenerCertificatesCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DescribeListenerCertificates.html
 */
export class DescribeListenerCertificatesCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimDescribeListenerCertificatesCommand,
      SimDescribeListenerCertificatesCommandOutput
    >
{
  /**
   * Report the certificates one listener carries.
   *
   * The default certificate comes first and is the only one flagged as such,
   * so a reader can tell which certificate the listener would present to a
   * client asking for no particular host name.
   */
  async handle(
    command: SimDescribeListenerCertificatesCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimDescribeListenerCertificatesCommandOutput> {
    const { input } = command;

    if (input.ListenerArn === undefined) {
      throw new SimElbV2ValidationError("ListenerArn is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorizeAnyResource(
      "DescribeListenerCertificates",
      options,
    );

    const listener = this.stores.listeners.requireByArn(input.ListenerArn);
    const page = new SimElbV2Page(
      listener.certificates,
      input.PageSize,
      input.Marker,
    );

    return {
      $metadata: {},
      Certificates: page.items,
      NextMarker: page.nextMarker,
    };
  }
}
