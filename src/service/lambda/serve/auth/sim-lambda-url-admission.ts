import type { SimAwsServiceRequest } from "../../../../serve/controller/sim-service-controller.js";
import type { SimAwsRequestCaller } from "../../../iam/request/sim-aws-request-caller.js";
import { SimLambdaUrlErrorResponse } from "../response/sim-lambda-url-error-response.js";
import type { SimLambdaFunctionUrlRoute } from "../sim-lambda-url-router.js";
import { SimLambdaUrlAuthorizer } from "./sim-lambda-url-authorizer.js";
import { simLambdaUrlPayloadRefusal } from "./sim-lambda-url-payload-hash.js";

/**
 * Whether a Function URL request may reach the function.
 *
 * An admitted request carries the caller its event describes, which is absent
 * for a `NONE` URL. A refused one carries the response Lambda answers with.
 */
export type SimLambdaUrlAdmissionResult =
  | { readonly admitted: true; readonly caller?: SimAwsRequestCaller }
  | { readonly admitted: false; readonly response: Response };

/**
 * Decides whether a request routed to a Function URL is let through to the
 * function, in the order real Lambda checks.
 */
export class SimLambdaUrlAdmission {
  private readonly errorResponse = new SimLambdaUrlErrorResponse();

  /**
   * Admit or refuse a request to a Function URL.
   *
   * A `NONE` URL authenticates nobody, so a signature is ignored, the request
   * is judged as anonymous, and the event describes no caller. The function's
   * resource policy still has to grant both actions to `*`, and a URL without
   * that answers 403 as it does on AWS.
   *
   * An `AWS_IAM` URL judges the caller resolved at the HTTP boundary, from a
   * signature or a named principal, and anonymous when the request offered
   * neither. Anonymous owns no policies, so an unsigned request is refused by
   * the same evaluation that admits a permitted one. What the request is made
   * on behalf of travels with it, so a CloudFront Distribution reaching the URL
   * through an origin access control is judged against the Distribution the
   * permission names.
   *
   * What an `AWS_IAM` request declares its body hashes to is settled first, as
   * real Lambda authenticates a request before it authorizes one. A POST or PUT
   * arriving through an origin access control declares an unsigned payload
   * unless the viewer sent a hash of its own, and Lambda takes no unsigned
   * payload.
   */
  async admit(
    route: SimLambdaFunctionUrlRoute,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<SimLambdaUrlAdmissionResult> {
    const authorizer = new SimLambdaUrlAuthorizer({ iam: route.iam });
    const target = {
      resource: route.resource,
      functionUrl: route.functionUrl,
    };

    if (route.functionUrl.authType === "NONE") {
      const decision = authorizer.authorize({
        ...target,
        caller: { kind: "anonymous" },
      });

      return decision.isDenied ? this.forbidden() : { admitted: true };
    }

    const payloadRefusal = await simLambdaUrlPayloadRefusal(
      serviceRequest.request,
    );

    if (payloadRefusal !== undefined) {
      return {
        admitted: false,
        response: this.errorResponse.signatureDoesNotMatch(payloadRefusal),
      };
    }

    const { caller, source } = serviceRequest;
    const decision = authorizer.authorize({
      ...target,
      caller: caller.toCaller(),
      source,
    });

    return decision.isDenied ? this.forbidden() : { admitted: true, caller };
  }

  private forbidden(): SimLambdaUrlAdmissionResult {
    return { admitted: false, response: this.errorResponse.forbidden() };
  }
}
