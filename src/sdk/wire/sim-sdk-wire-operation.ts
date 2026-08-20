import type { SimSdkWireRequest } from "./sim-sdk-wire.types.js";

/**
 * The AWS JSON protocol operation header.
 *
 * Every AWS JSON protocol request carries `<service target>.<operation>` here,
 * and no request of any other protocol carries it at all, so its presence is
 * what says a request can be read back into a Command without a schema.
 */
const operationHeaderName = "x-amz-target";

/**
 * The service target each AWS JSON protocol service stamps on its requests,
 * mapped to the SDK service id the Command routers are keyed by.
 *
 * The keys are the `serviceTarget` values in the SDK client packages, which is
 * the Smithy service shape name and does not change with the SDK version. The
 * values are `config.serviceId`, which is what an intercepted client would have
 * reported for the same call.
 *
 * Only JSON protocol services appear here. The other protocols the SDK speaks
 * (REST-JSON, Query, REST-XML) put the operation and its input in the method,
 * path, query string and an XML or form-encoded body, which cannot be read
 * back into a Command input without the operation's schema.
 */
const jsonProtocolServiceIds: ReadonlyMap<string, string> = new Map([
  ["AWSCognitoIdentityProviderService", "Cognito Identity Provider"],
  ["AWSEvents", "EventBridge"],
  ["AmazonEC2ContainerServiceV20141113", "ECS"],
  ["AmazonSQS", "SQS"],
  ["AmazonSSM", "SSM"],
  ["CertificateManager", "ACM"],
  ["DynamoDBStreams_20120810", "DynamoDB Streams"],
  ["DynamoDB_20120810", "DynamoDB"],
  ["GraniteServiceVersion20100801", "CloudWatch"],
  ["Logs_20140328", "CloudWatch Logs"],
  ["RekognitionService", "Rekognition"],
  ["TrentService", "KMS"],
  ["secretsmanager", "Secrets Manager"],
]);

/**
 * The part of a wire request the two readers below need.
 *
 * An AWS API request says which operation it is and what it was signed for in
 * its headers, so neither question needs the body. That leaves both of them
 * answerable for a request whose body has not been read, which is what a
 * client holding an outgoing request has.
 */
type SimSdkWireRequestHeaders = Pick<SimSdkWireRequest, "headers">;

/**
 * Which simulated service operation a wire request is asking for.
 */
export interface SimSdkWireOperation {
  /** The SDK `config.serviceId` of the service the request is addressed to. */
  readonly serviceId: string;
  /** The SDK Command class name the request would have been sent as. */
  readonly commandName: string;
}

/**
 * Read the operation an AWS JSON protocol request is asking for.
 *
 * Returns undefined for a request of any other protocol, and for a JSON
 * protocol request addressed to a service with no simulated equivalent, since
 * neither can be answered from the simulation.
 */
export function readSimSdkWireOperation(
  request: SimSdkWireRequestHeaders,
): SimSdkWireOperation | undefined {
  // oxlint-disable-next-line security/detect-object-injection -- this module's own fixed header name.
  const target = request.headers[operationHeaderName];
  if (target === undefined) {
    return undefined;
  }

  const separator = target.lastIndexOf(".");
  if (separator <= 0) {
    return undefined;
  }

  const serviceId = jsonProtocolServiceIds.get(target.slice(0, separator));
  const operationName = target.slice(separator + 1);
  if (serviceId === undefined || operationName.length === 0) {
    return undefined;
  }

  return { serviceId, commandName: `${operationName}Command` };
}

/**
 * The credential scope of a SigV4-signed request: the Region and the signing
 * service name the request was signed for.
 */
export interface SimSdkWireCredentialScope {
  readonly regionName: string;
  readonly signingName: string;
}

/**
 * Read the credential scope out of a signed request's Authorization header.
 *
 * The scope is `<date>/<region>/<signing name>/aws4_request`, which is where
 * the request itself says which Region and which service it was signed for.
 * That is more reliable than the endpoint hostname, which a client can be
 * pointed anywhere, and it is present whatever protocol the service speaks, so
 * an unsupported request can still say which service it was for.
 */
export function readSimSdkWireCredentialScope(
  request: SimSdkWireRequestHeaders,
): SimSdkWireCredentialScope | undefined {
  const authorization = request.headers["authorization"];
  const credential = /Credential=[^/]*\/(?<scope>[^,\s]+)/.exec(
    authorization ?? "",
  )?.groups?.["scope"];

  return simSdkWireCredentialScope(credential);
}

/**
 * The query parameter a presigned URL states its credential in, lower-cased.
 *
 * Signers emit the `X-Amz-` spelling. Names are compared without regard to
 * case, matching how the signature verifier reads the same parameter.
 */
const presignedCredentialParameter = "x-amz-credential";

/**
 * Read the credential scope a presigned URL states in its query string.
 *
 * A presigned URL is fetched by whatever holds it, over plain HTTP and with no
 * Authorization header to read. It states the same access key and scope in
 * `X-Amz-Credential`, and that parameter is the only place such a request says
 * which service and Region it was signed for.
 *
 * This is separate from the header form because the two answer different
 * questions. A request carrying an Authorization header came from an AWS SDK.
 * A presigned URL came from anything that can make an HTTP request, so a
 * caller asking whether it holds a serialized Command wants the header form
 * alone.
 */
export function readSimSdkWirePresignedCredentialScope(
  path: string,
): SimSdkWireCredentialScope | undefined {
  const query = path.indexOf("?");
  if (query === -1) {
    return undefined;
  }

  const parameters = new URLSearchParams(path.slice(query + 1));

  for (const [name, value] of parameters) {
    if (name.toLowerCase() === presignedCredentialParameter) {
      // The value is `<access key id>/<scope>`, as an Authorization header
      // writes it.
      return simSdkWireCredentialScope(value.slice(value.indexOf("/") + 1));
    }
  }

  return undefined;
}

/**
 * Read the Region and the signing name out of a credential scope value.
 *
 * The scope is `<date>/<region>/<signing name>/aws4_request` wherever it is
 * written. Anything of another shape yields nothing, since this answers a
 * routing question and a request that fails to say where it is going is one to
 * decline rather than one to fail.
 */
function simSdkWireCredentialScope(
  scope: string | undefined,
): SimSdkWireCredentialScope | undefined {
  const [, regionName, signingName] = scope?.split("/") ?? [];
  if (regionName === undefined || signingName === undefined) {
    return undefined;
  }

  return { regionName, signingName };
}
