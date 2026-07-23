import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
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
        async (command, context): Promise<unknown> =>
          await simAcm.describeCertificate(
            command as SimDescribeCertificateCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListCertificatesCommand",
        async (command, context): Promise<unknown> =>
          await simAcm.listCertificates(
            command as SimListCertificatesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "RequestCertificateCommand",
        async (command, context): Promise<unknown> =>
          await simAcm.requestCertificate(
            command as SimRequestCertificateCommand,
            simSdkCallerOptions(context),
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
