import {
  simAwsErrorDetailHeaderName,
  simAwsErrorHeaderName,
} from "../../../../serve/http/response/sim-aws-response-hints.js";

/**
 * What real Lambda says when it refuses a Function URL request.
 *
 * A refused request never reaches the handler and writes no log stream, so
 * this body is the only thing a deployment has to go on. The wording is real
 * Lambda's, down to the link, because that is what someone will be reading.
 */
export const simLambdaUrlForbiddenMessage =
  "Forbidden. For troubleshooting Function URL authorization issues, see: " +
  "https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html";

/**
 * What real Lambda says when a Function URL request does not verify.
 *
 * This is the answer a request that failed authentication gets, as opposed to
 * one that was authenticated and then not allowed, and the wording is what
 * anyone searching for the failure will have in front of them.
 */
export const simLambdaUrlSignatureMismatchMessage =
  "The request signature we calculated does not match the signature you " +
  "provided. Check your AWS Secret Access Key and signing method. Consult " +
  "the service documentation for details.";

/**
 * The error responses a Function URL endpoint returns itself, before or
 * instead of the function producing one.
 *
 * Real Lambda answers these with a small JSON document rather than the
 * handler's output, so client code that reads the body of a failed Function
 * URL call sees the same shape here.
 */
export class SimLambdaUrlErrorResponse {
  /**
   * No Function URL is served at this hostname.
   */
  notFound(): Response {
    return this.jsonResponse(404, "Not Found");
  }

  /**
   * The caller is not allowed to invoke this Function URL.
   */
  forbidden(): Response {
    return this.jsonResponse(403, simLambdaUrlForbiddenMessage);
  }

  /**
   * The request does not carry a signature over the body it arrived with.
   *
   * Real Lambda says only that the signature did not match, which is faithful
   * and impossible to act on, so what the simulator worked out goes in a hint
   * header where it changes nothing for a client reading the body.
   */
  signatureDoesNotMatch(detail: string): Response {
    const response = this.jsonResponse(
      403,
      simLambdaUrlSignatureMismatchMessage,
    );

    response.headers.set(simAwsErrorHeaderName, "SignatureDoesNotMatch");
    response.headers.set(simAwsErrorDetailHeaderName, detail);

    return response;
  }

  /**
   * The function failed to handle the invocation.
   */
  internalServerError(): Response {
    return this.jsonResponse(502, "Internal Server Error");
  }

  private jsonResponse(status: number, message: string): Response {
    return Response.json(
      { Message: message },
      {
        status,
        headers: { "content-type": "application/json" },
      },
    );
  }
}
