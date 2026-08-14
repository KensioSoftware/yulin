import type { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import type { SimCognitoTokenInput } from "../command/hosted/hosted-auth.command.js";

/**
 * The scheme the token endpoint's client authentication header uses.
 *
 * The scheme name is matched without regard to case, as HTTP authentication
 * scheme names are. The credentials are the base64 of `client_id:client_secret`
 * as Cognito's own documentation writes them, rather than the form encoded
 * pair the OAuth specification describes, because an app client's id and
 * secret hold nothing that either encoding would change.
 */
const basicScheme = /^basic (?<credentials>.+)$/iu;

/**
 * Reads a `/oauth2/token` request into the fields the endpoint answers on.
 *
 * The body is form encoded, as the OAuth 2.0 specification requires, and the
 * app client's id and secret arrive either in that body or in a basic
 * authorization header. Both are read here so the endpoint itself does not
 * have to care which the application used, which is what
 * `client_secret_basic` and `client_secret_post` are.
 */
export class SimCognitoTokenRequest {
  /**
   * The fields a token request carries.
   */
  read(serviceRequest: SimAwsServiceRequest): SimCognitoTokenInput {
    const body = new URLSearchParams(this.bodyText(serviceRequest));
    const fields = Object.fromEntries(body);
    const basic = this.basicCredentials(serviceRequest);

    return {
      ...fields,
      ...basic,
    };
  }

  /**
   * The body as it arrived, which the serving layer buffered.
   */
  private bodyText(serviceRequest: SimAwsServiceRequest): string {
    if (serviceRequest.body === undefined) {
      return "";
    }

    return Buffer.from(serviceRequest.body).toString("utf8");
  }

  /**
   * The app client id and secret from a basic authorization header.
   *
   * The header wins over the body where a request carries both, because it is
   * the more specific of the two: an application that signed its request has
   * said which client it is.
   */
  private basicCredentials(
    serviceRequest: SimAwsServiceRequest,
  ): Partial<SimCognitoTokenInput> {
    const header = serviceRequest.request.headers.get("authorization") ?? "";
    const credentials = basicScheme.exec(header)?.groups?.["credentials"];

    if (credentials === undefined) {
      return {};
    }

    const decoded = Buffer.from(credentials, "base64").toString("utf8");
    const separator = decoded.indexOf(":");

    if (separator === -1) {
      return {};
    }

    return {
      client_id: decoded.slice(0, separator),
      client_secret: decoded.slice(separator + 1),
    };
  }
}
