import type { SimAwsRequestAuthFailure } from "../../../service/iam/request/error/sim-aws-request-auth.error.js";
import { simAwsCallerHeaderName } from "../../../service/iam/request/sim-aws-caller-header.js";
import type { SimAwsRequestCaller } from "../../../service/iam/request/sim-aws-request-caller.js";

/**
 * How the caller was established, reported back on the response.
 */
export const simAwsAuthHeaderName = "x-sim-aws-auth";

/**
 * The AWS error code a rejected request was refused with.
 */
export const simAwsErrorHeaderName = "x-sim-aws-error";

/**
 * Why the request was refused, in more detail than the AWS response body has
 * anywhere to put it.
 */
export const simAwsErrorDetailHeaderName = "x-sim-aws-error-detail";

/**
 * Stamps the simulator's own account of a request onto its response.
 *
 * These hints go in headers, never in the body, so that a response stays the
 * shape the real service returns and client code parsing it is unaffected.
 * That matters most where AWS is least forthcoming: a Function URL rejects a
 * bad signature with nothing but `{"Message":"Forbidden"}`, which is faithful
 * and useless to debug against, so the detail is carried alongside instead.
 */
export class SimAwsResponseHints {
  /**
   * Report who the simulator decided the caller was, and how.
   */
  stampCaller(response: Response, caller: SimAwsRequestCaller): Response {
    response.headers.set(simAwsCallerHeaderName, caller.toHeaderValue());
    response.headers.set(simAwsAuthHeaderName, caller.authMethod);

    return response;
  }

  /**
   * Report that the request was refused before it reached a service, and why.
   */
  stampAuthFailure(
    response: Response,
    failure: SimAwsRequestAuthFailure,
  ): Response {
    response.headers.set(simAwsAuthHeaderName, "rejected");
    response.headers.set(simAwsErrorHeaderName, failure.code);
    response.headers.set(
      simAwsErrorDetailHeaderName,
      singleLine(failure.message),
    );

    return response;
  }
}

/**
 * Flatten a message into something a header value can hold.
 */
function singleLine(message: string): string {
  return message.replaceAll(/\s+/g, " ").trim();
}
