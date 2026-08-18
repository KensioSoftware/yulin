import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCallerIdentifier } from "../../../iam/error/sim-iam-caller-identifier.js";
import { SimRekognitionAccessDeniedException } from "../../error/sim-rekognition.error.js";
import type { SimRekognitionRequestOptions } from "../sim-rekognition-request-options.js";

/**
 * The resource a Rekognition detection authorizes against.
 *
 * Real Rekognition gives the detection operations no resource-level
 * permissions, because the image is passed in rather than being a Rekognition
 * resource there is an ARN for. A policy allowing
 * `rekognition:DetectModerationLabels` has to use a resource of `*`, and one
 * naming an ARN reaches nothing, here as on AWS.
 *
 * A collection is the other kind. It has an ARN, and its operations authorize
 * against that, so those pass one in.
 */
const anyResource = "*";

interface SimRekognitionAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to Rekognition requests.
 *
 * A denial is reported as Rekognition's own AccessDeniedException rather than
 * the shared IAM error, because that is the error name and the 400 status a
 * real Rekognition caller would have to handle. The S3 read that follows a
 * successful authorization is authorized separately, as the caller, by
 * simulated S3.
 */
export class SimRekognitionAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly callerIdentifier = new SimIamCallerIdentifier();

  constructor(properties: SimRekognitionAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an action, on a resource where there is one.
   */
  authorize(
    action: string,
    options: SimRekognitionRequestOptions = {},
    resource: string = anyResource,
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({
      action,
      resource,
      caller: options.caller,
    });

    if (decision.isDenied) {
      throw new SimRekognitionAccessDeniedException(
        `User: ${this.callerIdentifier.format(decision.caller.principal)} is ` +
          `not authorized to perform: ${action} because no identity-based ` +
          `policy allows the ${action} action`,
      );
    }

    return decision.caller;
  }
}
