import { randomUUID } from "node:crypto";

import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsRequestCaller } from "../../../iam/request/sim-aws-request-caller.js";
import type { SimLambdaFunctionUrl } from "../../function/url/sim-lambda-function-url.js";
import type { SimLambdaFunctionUrlRequestContext } from "./sim-lambda-url-event.type.js";
import { simLambdaUrlEventTime } from "./sim-lambda-url-event-time.js";
import {
  simLambdaUrlAnonymousAccountId,
  SimLambdaUrlIamCaller,
} from "./sim-lambda-url-iam-authorizer.js";

interface SimLambdaUrlRequestContextInput {
  readonly request: Request;
  readonly url: URL;
  readonly functionUrl: SimLambdaFunctionUrl;
  readonly authenticatedCaller?: SimAwsRequestCaller | undefined;
}

/**
 * Builds the requestContext block of a Function URL invocation event.
 *
 * This describes the AWS-shaped endpoint the request reached and, when the
 * Function URL authenticated one, the caller behind it. A caller is supplied
 * only for an `AWS_IAM` invocation, which is what makes the authorizer block
 * present there and absent for `NONE`, as it is on real AWS.
 */
export class SimLambdaUrlRequestContextBuilder {
  private readonly clock: SimClock;

  constructor(clock: SimClock) {
    this.clock = clock;
  }

  /**
   * Build the requestContext for one Function URL request.
   */
  build(
    input: SimLambdaUrlRequestContextInput,
  ): SimLambdaFunctionUrlRequestContext {
    const { request, url, functionUrl } = input;
    const now = this.clock.now();
    const iamCaller = this.iamCaller(input.authenticatedCaller);

    const requestContext: SimLambdaFunctionUrlRequestContext = {
      // An unauthenticated Function URL request has no Account behind it, and
      // that is what a Function URL calls anonymous.
      accountId: iamCaller?.accountId() ?? simLambdaUrlAnonymousAccountId,
      apiId: functionUrl.urlId,
      domainName: functionUrl.hostname,
      domainPrefix: functionUrl.urlId,
      http: {
        method: request.method,
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: request.headers.get("user-agent") ?? "",
      },
      requestId: randomUUID(),
      routeKey: "$default",
      stage: "$default",
      time: simLambdaUrlEventTime(now),
      timeEpoch: now.getTime(),
    };

    const authorizer = iamCaller?.authorizerContext();
    if (authorizer !== undefined) {
      requestContext.authorizer = authorizer;
    }

    return requestContext;
  }

  private iamCaller(
    caller: SimAwsRequestCaller | undefined,
  ): SimLambdaUrlIamCaller | undefined {
    return caller === undefined ? undefined : new SimLambdaUrlIamCaller(caller);
  }
}
