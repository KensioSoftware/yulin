import type { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import type { SimS3RequestOptions } from "../command/sim-s3-request-options.js";

/**
 * The options an S3 command is run with for a request served over HTTP.
 *
 * The command runs as the principal the boundary resolved, and IAM sees the
 * client address the request came from.
 */
export function simS3ServedOptions(
  serviceRequest: SimAwsServiceRequest,
): SimS3RequestOptions {
  return {
    caller: serviceRequest.caller.toCaller(),
    sourceIp: serviceRequest.sourceIp,
  };
}
