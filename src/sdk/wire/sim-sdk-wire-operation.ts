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

  const [, regionName, signingName] = credential?.split("/") ?? [];
  if (regionName === undefined || signingName === undefined) {
    return undefined;
  }

  return { regionName, signingName };
}
