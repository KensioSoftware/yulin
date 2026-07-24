import type { SimAwsCaller } from "../../../../aws/caller/sim-aws-caller.js";
import { SimLambdaError } from "../../../error/sim-lambda.error.js";

/**
 * A request to fetch a sim Lambda code zip archive from object storage.
 *
 * The caller is the principal creating the function, so fetching the code
 * object applies the same simulated IAM authorization as on real AWS, where
 * the creating principal needs access to the S3 code object.
 */
export interface SimLambdaCodeStoreRequest {
  readonly bucketName: string;
  readonly objectKey: string;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Storage that sim Lambda fetches S3-located function code zips from.
 */
export interface SimLambdaCodeStore {
  getZipBytes(request: SimLambdaCodeStoreRequest): Promise<Uint8Array>;
}

/**
 * Code store used when no sim S3 is wired up, such as for a standalone
 * SimLambda constructed outside SimAws.
 */
export class SimLambdaNoCodeStore implements SimLambdaCodeStore {
  /**
   * Reject the fetch with an explanation of how to wire sim S3 code storage.
   */
  getZipBytes(request: SimLambdaCodeStoreRequest): Promise<Uint8Array> {
    return Promise.reject(
      new SimLambdaError(
        "Cannot fetch sim Lambda function code from " +
          `s3://${request.bucketName}/${request.objectKey}: this SimLambda ` +
          "has no sim S3 code store. Create the function through SimAws, " +
          "or construct SimLambda with a codeStore.",
      ),
    );
  }
}
