import {
  SimAwsInvalidCallerHeader,
  type SimAwsRequestAuthFailure,
} from "../../../service/iam/request/error/sim-aws-request-auth.error.js";
import { SimIamIncompleteSignature } from "../../../service/iam/sigv4/error/sim-iam-sigv4.error.js";
import { SimAwsResponseHints } from "./sim-aws-response-hints.js";

/**
 * The response a request refused at the authentication boundary gets.
 *
 * The body is the small JSON document AWS answers a rejected request with, and
 * nothing more: real AWS does not explain itself here, and neither does this.
 * Everything the simulator can say about the refusal goes into `x-sim-aws-*`
 * headers, where it helps without changing the shape of the response any
 * client is written against.
 */
export class SimAwsAuthFailureResponse {
  private readonly hints = new SimAwsResponseHints();

  /**
   * Build the HTTP response for a failed request authentication.
   */
  build(failure: SimAwsRequestAuthFailure): Response {
    const rejected = this.rejectedResponse(failure);

    return this.hints.stampAuthFailure(rejected, failure);
  }

  private rejectedResponse(failure: SimAwsRequestAuthFailure): Response {
    if (this.isBadRequest(failure)) {
      return this.jsonResponse(400, "Bad Request", failure.code);
    }

    return this.jsonResponse(403, "Forbidden", failure.code);
  }

  /**
   * Whether the request was malformed rather than unauthenticated.
   *
   * A caller header the simulator cannot read is a mistake in driving Yulin
   * rather than a failed AWS authentication. A signature too incomplete to
   * parse is the one SigV4 rejection real AWS also answers with a 400, because
   * nothing was presented that could have been authenticated; every other SigV4
   * rejection is a 403.
   */
  private isBadRequest(failure: SimAwsRequestAuthFailure): boolean {
    return (
      failure instanceof SimAwsInvalidCallerHeader ||
      failure instanceof SimIamIncompleteSignature
    );
  }

  private jsonResponse(
    status: number,
    message: string,
    errorType: string,
  ): Response {
    return Response.json(
      { Message: message },
      {
        status,
        headers: {
          "content-type": "application/json",
          "x-amzn-errortype": errorType,
        },
      },
    );
  }
}
