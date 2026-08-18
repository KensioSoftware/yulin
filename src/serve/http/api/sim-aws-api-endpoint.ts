import { SimSdkUnbridgedWireRequestError } from "../../../sdk/error/sim-sdk.error.js";
import { SimSdkWireDispatcher } from "../../../sdk/wire/sim-sdk-wire-dispatcher.js";
import { readSimSdkWireCredentialScope } from "../../../sdk/wire/sim-sdk-wire-operation.js";
import type { SimSdkWireRequest } from "../../../sdk/wire/sim-sdk-wire.types.js";
import type { SimAws } from "../../../service/aws/sim-aws.js";
import { SimS3ApiEndpoint } from "../../../service/s3/serve/api/sim-s3-api.js";
import { SimStsApiEndpoint } from "../../../service/sts/serve/sim-sts-api.js";
import { SimAwsReceivedRequest } from "../request/sim-aws-received-request.js";

interface SimAwsApiEndpointProperties {
  readonly simAws: SimAws;
}

/**
 * The SigV4 signing names of the services whose protocol is read by an
 * endpoint of its own rather than by the AWS JSON protocol dispatcher.
 */
const s3SigningName = "s3";
const stsSigningName = "sts";

/**
 * The general AWS service API, served on one endpoint.
 *
 * Every other served endpoint is routed by hostname, because every other
 * served endpoint belongs to a resource that was issued a hostname. A client
 * given `--endpoint-url` or `AWS_ENDPOINT_URL` sends `Host: localhost:<port>`
 * for every service, so there is no hostname to route on. What the request
 * does carry is its SigV4 credential scope, which names the service and the
 * Region it was signed for, and a client cannot alter either without
 * invalidating the signature.
 *
 * So this endpoint routes on the credential scope. One endpoint URL then
 * serves every simulated service, which is the shape `--endpoint-url` wants.
 *
 * The scope also says which protocol to read the request with. Most simulated
 * services speak the AWS JSON protocol and name their operation in a header.
 * S3 speaks REST-XML and STS speaks Query, and each names its operation
 * somewhere else, so each is read by an endpoint of its own.
 */
export class SimAwsApiEndpoint {
  private readonly simAws: SimAws;
  private readonly dispatcher: SimSdkWireDispatcher;
  private readonly s3: SimS3ApiEndpoint;
  private readonly sts: SimStsApiEndpoint;

  constructor(properties: SimAwsApiEndpointProperties) {
    this.simAws = properties.simAws;
    this.dispatcher = new SimSdkWireDispatcher(properties.simAws);
    this.s3 = new SimS3ApiEndpoint({ simAws: properties.simAws });
    this.sts = new SimStsApiEndpoint({ simAws: properties.simAws });
  }

  /**
   * Answer an AWS service API request, or decline one that is not signed.
   *
   * An unsigned request says nothing about which service it is for, so it is
   * declined rather than guessed at, and the caller falls back to whatever it
   * does for a hostname the simulation serves nothing at.
   */
  async handle(request: Request): Promise<Response | undefined> {
    const received = await SimAwsReceivedRequest.receive(request);
    const wireRequest = simAwsApiWireRequest(request, received.body);

    const scope = readSimSdkWireCredentialScope(wireRequest);
    if (scope === undefined) {
      return undefined;
    }

    const caller = this.simAws.resolveRequestCaller(request, {
      body: received.body,
      expectedScope: {
        serviceName: scope.signingName,
        regionName: scope.regionName,
      },
    });

    // S3 states its operation in the method and path, and STS in a
    // form-encoded field, so neither can be read by the header the AWS JSON
    // protocol names its operation in.
    const body = received.body ?? new Uint8Array();

    if (scope.signingName === s3SigningName) {
      return await this.s3.handle(
        request,
        body,
        caller.toCaller(),
        scope.regionName,
      );
    }

    if (scope.signingName === stsSigningName) {
      return await this.sts.handle(
        request,
        body,
        caller.toCaller(),
        scope.regionName,
      );
    }

    let response;
    try {
      response = await this.dispatcher.dispatch(wireRequest, caller.toCaller());
    } catch (error) {
      if (error instanceof SimSdkUnbridgedWireRequestError) {
        return simAwsUnservedProtocolResponse(error);
      }

      throw error;
    }

    return new Response(response.body.length === 0 ? null : response.body, {
      status: response.statusCode,
      headers: { ...response.headers },
    });
  }
}

/**
 * Refuse a request whose protocol this endpoint cannot read.
 *
 * `501 Not Implemented` rather than a server error, because the two differ in
 * a way the client acts on: an SDK retries a 500 and gives up on a 501. A
 * request this endpoint will never understand is answered once, and the reason
 * travels in the body for whoever reads the response.
 */
function simAwsUnservedProtocolResponse(error: Error): Response {
  return new Response(`${error.message}\n`, {
    status: 501,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Read a received request as the AWS API request it is on the wire.
 *
 * The body is passed in already buffered, because SigV4 verification needs
 * the same bytes and a request body can only be read once.
 */
function simAwsApiWireRequest(
  request: Request,
  body: Uint8Array | undefined,
): SimSdkWireRequest {
  const url = new URL(request.url);

  return {
    method: request.method,
    hostname: url.hostname,
    path: `${url.pathname}${url.search}`,
    headers: Object.fromEntries(request.headers),
    body: body ?? new Uint8Array(),
  };
}
