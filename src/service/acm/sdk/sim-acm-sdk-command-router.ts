import type {
  SimSdkCommandRoute,
  SimSdkCommandRouter,
} from "../../../sdk/router/sim-sdk-command-router.type.js";
import type { SimDescribeCertificateCommand } from "../command/describe-certificate/describe-certificate.cmd.js";
import type { SimListCertificatesCommand } from "../command/list-certificates/list-certificates.cmd.js";
import type { SimRequestCertificateCommand } from "../command/request-certificate/request-certificate.cmd.js";
import type { SimAcm } from "../sim-acm.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated ACM instance.
 */
export class SimAcmSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simAcm: SimAcm) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "DescribeCertificateCommand",
        async (command): Promise<unknown> =>
          await simAcm.describeCertificate(
            command as SimDescribeCertificateCommand,
          ),
      ],
      [
        "ListCertificatesCommand",
        async (command): Promise<unknown> =>
          await simAcm.listCertificates(command as SimListCertificatesCommand),
      ],
      [
        "RequestCertificateCommand",
        async (command): Promise<unknown> =>
          await simAcm.requestCertificate(
            command as SimRequestCertificateCommand,
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated ACM can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated ACM supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
