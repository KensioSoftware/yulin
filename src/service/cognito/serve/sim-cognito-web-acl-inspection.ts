import {
  type SimWafInspected,
  SimWafRequestInspection,
} from "../../wafv2/association/sim-waf-request-inspection.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";
import type { SimCognitoUserPool } from "../user-pool/sim-cognito-user-pool.js";

interface SimCognitoInspectionInput {
  readonly pool: SimCognitoUserPool;

  /** The simulated Cognito scope the pool belongs to. */
  readonly cognito: SimCognitoIdentityProvider;

  readonly request: Request;
}

/**
 * Puts a request to the web ACL in front of the pool it reached.
 *
 * This runs before the endpoint the request named answers it, so a blocked
 * request gets 403 and the endpoint does not run. Everything the pool serves
 * over HTTP goes through it, which is what real AWS WAF covers: managed login,
 * the classic hosted UI and the pool's own OIDC documents.
 *
 * The body is not forwarded. Cognito sends AWS WAF the headers and the path of
 * a managed login request and none of its body, so a rule inspecting the body
 * matches nothing at a hosted domain, however well formed it is. Body rules do
 * reach the user pool API operations, which arrive here as SDK Commands rather
 * than as HTTP requests and carry no web ACL evaluation at all.
 */
export class SimCognitoWebAclInspection {
  private readonly inspection = new SimWafRequestInspection();

  /**
   * Put one request to whatever protects the pool it addressed.
   */
  async inspect(input: SimCognitoInspectionInput): Promise<SimWafInspected> {
    return await this.inspection.inspect({
      protection: input.cognito.webAcls(),
      resourceArn: input.pool.arn.value,
      request: input.request,
      forwardBody: false,
    });
  }
}
