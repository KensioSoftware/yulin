import {
  simIamSigV4ContentSha256Header,
  SimIamSigV4PayloadDeclaration,
  simIamSigV4UnsignedPayload,
} from "../../../iam/sigv4/canonical/sim-iam-sigv4-payload-hash.js";
import { SimIamSigV4Error } from "../../../iam/sigv4/error/sim-iam-sigv4.error.js";

/**
 * Why a Function URL request's payload hash cannot be accepted, or nothing
 * when it can.
 *
 * Lambda checks what a request declares its body hashes to before it looks at
 * who is asking, and answers a request that fails the check with a signature
 * mismatch. Two declarations fail it. One is a digest that disagrees with the
 * bytes that arrived, which would otherwise let a signed request carry any body
 * at all. The other is `UNSIGNED-PAYLOAD`, which Lambda refuses outright.
 * CloudFront signs a POST or PUT with it when the viewer sent no hash, and that
 * is why such a request through an origin access control never reaches the
 * function.
 *
 * A request declaring nothing is not checked. The hash is an input to the
 * signature rather than something a request has to state, so a caller that
 * signed the body it sent and left the header off has said nothing to
 * disagree with.
 *
 * The method the request used makes no difference here. A declaration is a
 * claim about the body, and SigV4 covers it for a GET as much as for a POST,
 * so a GET carrying a digest of other bytes is refused as well. The method
 * matters on the CloudFront side, which invents a declaration for a POST or a
 * PUT alone.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
 */
export async function simLambdaUrlPayloadRefusal(
  request: Request,
): Promise<string | undefined> {
  if (!request.headers.has(simIamSigV4ContentSha256Header)) {
    return undefined;
  }

  const declaration = SimIamSigV4PayloadDeclaration.fromHeaders(
    request.headers,
  );
  // A clone, so the body is still there for the invocation event to read.
  const body = new Uint8Array(await request.clone().arrayBuffer());
  let declared: string;

  try {
    declared = declaration.hashFor(body);
  } catch (error) {
    if (error instanceof SimIamSigV4Error) {
      return error.message;
    }

    /* v8 ignore next 2 -- a declaration is refused with nothing else */
    throw error;
  }

  if (declared !== simIamSigV4UnsignedPayload) {
    return undefined;
  }

  return (
    `Signed ${simIamSigV4ContentSha256Header} declares ` +
    `${simIamSigV4UnsignedPayload}, which Lambda does not support. A ` +
    `${request.method} to a Function URL has to declare the SHA-256 of its ` +
    `body, and one sent through a CloudFront origin access control declares ` +
    `whatever the viewer request declared.`
  );
}
