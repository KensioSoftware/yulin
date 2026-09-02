import { SimSdkWireDispatcher } from "../../../../sdk/wire/sim-sdk-wire-dispatcher.js";
import {
  readSimSdkWireCredentialScope,
  readSimSdkWireOperation,
} from "../../../../sdk/wire/sim-sdk-wire-operation.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import { SimS3ApiEndpoint } from "../../../s3/serve/api/sim-s3-api.js";
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
 * The SigV4 signing name of the one service here whose requests an endpoint of
 * its own reads.
 *
 * S3 states its operation in the method, the path and a query-string
 * sub-resource. `SimS3ApiEndpoint` reads those. The signing name is where a
 * signed request says which service it is for, whatever protocol that service
 * speaks, and that is what selects the endpoint here, as it is on the served
 * AWS API endpoint.
 */
const s3SigningName = "s3";

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

/**
 * Whether a request to an AWS service API endpoint is an API call, or an
 * ordinary HTTP request to the same hostname.
 *
 * A service API endpoint answers both. What an SDK sends carries the operation
 * header of the AWS JSON protocol, or the SigV4 credentials it was signed
 * with, or both, and the wire dispatcher answers it. A token verifier fetching
 * from the same hostname carries neither, because it holds nothing to sign
 * with. A user pool publishes its JWKS and its OpenID configuration to whoever
 * asks, and both are read over plain HTTP.
 */
export function isSimAwsApiRequest(request: Request): boolean {
  const wireRequest = { headers: Object.fromEntries(request.headers) };

  return (
    readSimSdkWireOperation(wireRequest) !== undefined ||
    readSimSdkWireCredentialScope(wireRequest) !== undefined
  );
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
  private readonly s3: SimS3ApiEndpoint;

  constructor(properties: SimLambdaAwsApiOutboundProperties) {
    this.dispatcher = new SimSdkWireDispatcher(
      properties.simAws,
      properties.regionName,
    );
    this.s3 = new SimS3ApiEndpoint({ simAws: properties.simAws });
  }

  /**
   * Whether a hostname is one of the AWS service API endpoints.
   */
  serves(hostname: string): boolean {
    return isSimAwsEndpointHostname(hostname);
  }

  /**
   * Answer an AWS API request from the simulated operation it names.
   *
   * A request signed for S3 goes to the endpoint that reads S3's protocol,
   * since S3 names its operation where the wire dispatcher looks for a header.
   * No caller travels with it. The SDK signed it with the placeholder
   * credentials the runtime puts in the environment, and the invocation is
   * already running as the execution Role, the ambient caller every other call
   * out of function code runs as.
   */
  async fetch(request: Request): Promise<Response> {
    const wireRequest = await simLambdaOutboundWireRequest(request);
    const scope = readSimSdkWireCredentialScope(wireRequest);

    if (scope?.signingName === s3SigningName) {
      return await this.s3.handle(
        request,
        wireRequest.body,
        undefined,
        scope.regionName,
      );
    }

    return simLambdaOutboundWireResponse(
      await this.dispatcher.dispatch(wireRequest),
    );
  }
}
