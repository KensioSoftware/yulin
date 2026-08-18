import { SimSdkWireDispatcher } from "../../../../sdk/wire/sim-sdk-wire-dispatcher.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimLambdaOutboundHttp } from "./sim-lambda-outbound-http.js";
import {
  simLambdaOutboundWireRequest,
  simLambdaOutboundWireResponse,
} from "./sim-lambda-outbound-wire.js";

/**
 * The hostname suffixes AWS issues its service API endpoints under.
 *
 * A request to one of these is a request to an AWS service API whoever sent
 * it, so it belongs to the simulation rather than the network. Everything else
 * a function asks for is either a hostname the simulation serves some other
 * way or one it serves nothing at.
 *
 * `.on.aws` is not among them: what AWS issues under it is Lambda Function
 * URLs, which are the endpoint of one function rather than a service API.
 */
const awsEndpointSuffixes: readonly string[] = [
  ".amazonaws.com",
  ".amazonaws.com.cn",
  ".api.aws",
];

/**
 * The label an endpoint hostname carries when it names one resource rather
 * than a service API: an API Gateway HTTP API, under `.amazonaws.com`.
 *
 * A request to one of these is an ordinary HTTP request to something the
 * simulation may be running, not a serialized Command, so there is nothing
 * here to route it as. Simulated Route53 answers for it instead, in the same
 * way it answers for every other hostname a resource is issued.
 */
const resourceEndpointLabel = ".execute-api.";

/**
 * Whether a hostname is an AWS service API endpoint.
 */
export function isSimAwsEndpointHostname(hostname: string): boolean {
  const name = hostname.toLowerCase();

  if (name.includes(resourceEndpointLabel)) {
    return false;
  }

  return awsEndpointSuffixes.some((suffix) => name.endsWith(suffix));
}

interface SimLambdaAwsApiOutboundProperties {
  readonly simAws: SimAws;

  /**
   * The Region the function code is running in, which answers a request whose
   * credential scope names none.
   */
  readonly regionName?: AwsRegionName | undefined;
}

/**
 * Answers the AWS service API requests sim Lambda function code sends.
 *
 * This is the half of a function's outbound HTTP that carries a serialized
 * Command rather than an ordinary HTTP request: the SDK has already signed and
 * encoded it by the time it reaches a transport, so the request itself is what
 * there is to route, and the wire dispatcher turns it back into the simulated
 * operation it names.
 */
export class SimLambdaAwsApiOutbound implements SimLambdaOutboundHttp {
  private readonly dispatcher: SimSdkWireDispatcher;

  constructor(properties: SimLambdaAwsApiOutboundProperties) {
    this.dispatcher = new SimSdkWireDispatcher(
      properties.simAws,
      properties.regionName,
    );
  }

  /**
   * Whether a hostname is one of the AWS service API endpoints.
   */
  serves(hostname: string): boolean {
    return isSimAwsEndpointHostname(hostname);
  }

  /**
   * Answer an AWS API request from the simulated operation it names.
   */
  async fetch(request: Request): Promise<Response> {
    return simLambdaOutboundWireResponse(
      await this.dispatcher.dispatch(
        await simLambdaOutboundWireRequest(request),
      ),
    );
  }
}
