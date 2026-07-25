import { SimAws } from "../../aws/sim-aws.js";
import type {
  SimAwsServiceController,
  SimAwsServiceTarget,
} from "../../../serve/controller/sim-service-controller.js";
import { SimRoute53ZoneSummaryPage } from "./zone-summary/sim-route53-zone-summary-page.js";

interface SimRoute53ServiceControllerProperties {
  readonly simAws?: SimAws;
}

/**
 * Localhost HTTP controller for simulated Route53.
 *
 * Unlike the S3 and CloudFront controllers, this one does not serve a simulated
 * AWS resource. It serves Yulin's own view of the simulated hosted zones, so a
 * developer running `serveSimAws` can inspect Route53 state in a browser.
 */
export class SimRoute53ServiceController implements SimAwsServiceController {
  private readonly simAws: SimAws;

  constructor(properties: SimRoute53ServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.simAws = simAws;
  }

  /**
   * Handle an HTTP request routed to the simulated Route53 summary host.
   */
  handleRequest(
    _target: SimAwsServiceTarget,
    request: Request,
  ): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname !== "/") {
      return Promise.resolve(
        new Response(`No simulated Route53 resource at ${pathname}\n`, {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      );
    }

    const page = new SimRoute53ZoneSummaryPage(
      this.simAws.route53().resolvableHostedZones(),
    );

    return Promise.resolve(
      new Response(page.render(), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
  }
}
