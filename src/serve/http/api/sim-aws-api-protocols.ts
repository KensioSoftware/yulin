import type { SimAwsCaller } from "../../../service/aws/caller/sim-aws-caller.js";
import type { SimAws } from "../../../service/aws/sim-aws.js";
import { simCloudFormationApiEndpoint } from "../../../service/cloudformation/serve/sim-cloudformation-api.js";
import { simLambdaApiEndpoint } from "../../../service/lambda/serve/api/sim-lambda-api.js";
import { SimS3ApiEndpoint } from "../../../service/s3/serve/api/sim-s3-api.js";
import { simSnsApiEndpoint } from "../../../service/sns/serve/sim-sns-api.js";
import { simStsApiEndpoint } from "../../../service/sts/serve/sim-sts-api.js";

/**
 * A served endpoint that reads one AWS protocol other than AWS JSON.
 */
export interface SimAwsProtocolEndpoint {
  handle(
    request: Request,
    body: Uint8Array,
    caller: SimAwsCaller,
    regionName: string,
  ): Promise<Response>;
}

/**
 * The services whose requests are read by an endpoint of their own, keyed by
 * the SigV4 signing name that routes a request to one.
 *
 * Most simulated services speak the AWS JSON protocol and name their operation
 * in a header, and those are dispatched from the header without any of this.
 * The rest name their operation somewhere the header does not reach: S3 in the
 * method and the path, and the Query services in a form-encoded field. Each of
 * those needs a reader, and the signing name is the only thing in the request
 * that says which one to use, since a client given `--endpoint-url` sends the
 * same hostname whatever service it is addressing.
 *
 * A service joins this by adding an entry. The value builds the endpoint from
 * the environment it serves, so nothing is built until an endpoint exists to
 * serve.
 */
const simAwsProtocolEndpointFactories = new Map<
  string,
  (simAws: SimAws) => SimAwsProtocolEndpoint
>([
  ["s3", (simAws): SimAwsProtocolEndpoint => new SimS3ApiEndpoint({ simAws })],
  ["sts", simStsApiEndpoint],
  ["sns", simSnsApiEndpoint],
  ["cloudformation", simCloudFormationApiEndpoint],
  ["lambda", simLambdaApiEndpoint],
]);

/**
 * Build the endpoint for each service that reads its own protocol.
 */
export function simAwsProtocolEndpoints(
  simAws: SimAws,
): ReadonlyMap<string, SimAwsProtocolEndpoint> {
  return new Map(
    simAwsProtocolEndpointFactories
      .entries()
      .map(([signingName, build]) => [signingName, build(simAws)]),
  );
}
