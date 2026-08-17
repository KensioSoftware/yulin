import type { SimAwsServiceRequest } from "../../../../serve/controller/sim-service-controller.js";
import type { SimCognitoPageParameters } from "./sim-cognito-page-markup.js";

/**
 * What a request to a managed login page carried.
 *
 * A page is reached with a query string and posted back with a form encoded
 * body, and both are name and value pairs, so they are read into the same
 * record. Which of them a value came from changes nothing about what the page
 * does with it.
 */
export class SimCognitoPageRequest {
  /**
   * The values a request carried, from its body where it has one and from its
   * query string where it has not.
   */
  values(
    serviceRequest: SimAwsServiceRequest,
    url: URL,
  ): SimCognitoPageParameters {
    if (serviceRequest.request.method === "GET") {
      return Object.fromEntries(url.searchParams);
    }

    return Object.fromEntries(new URLSearchParams(this.body(serviceRequest)));
  }

  /**
   * The body as it arrived, which the serving layer buffered.
   */
  private body(serviceRequest: SimAwsServiceRequest): string {
    if (serviceRequest.body === undefined) {
      return "";
    }

    return Buffer.from(serviceRequest.body).toString("utf8");
  }
}
