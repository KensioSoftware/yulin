import type { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import type { SimAwsCaller } from "../../../../aws/caller/sim-aws-caller.js";
import { assertDefined } from "../../../../../util/type-guard/defined.js";
import { SimLambdaInvalidParameterValueException } from "../../../error/sim-lambda.error.js";
import type {
  SimLambdaCodeStore,
  SimLambdaCodeStoreRequest,
} from "./sim-lambda-code-store.js";

/**
 * The narrow slice of simulated S3 that Lambda code fetching needs.
 * SimS3 structurally implements this interface.
 */
export interface SimLambdaCodeObjectSource {
  getObject(
    command: { input: { Bucket: string; Key: string } },
    options?: { caller: SimAwsCaller },
  ): Promise<{ Body?: Readable }>;
}

interface SimS3LambdaCodeStoreProperties {
  readonly s3: SimLambdaCodeObjectSource;
}

/**
 * Sim S3-backed storage for S3-located Lambda function code zips.
 *
 * Fetches go through the sim S3 GetObject operation as the creating caller,
 * so simulated IAM applies to the code object exactly as s3:GetObject
 * authorization applies on real AWS. S3 lookup failures are reported with
 * the AWS-like Lambda InvalidParameterValueException wrapping.
 */
export class SimS3LambdaCodeStore implements SimLambdaCodeStore {
  constructor(private readonly properties: SimS3LambdaCodeStoreProperties) {}

  /**
   * Fetch the code zip object body from sim S3.
   */
  async getZipBytes(request: SimLambdaCodeStoreRequest): Promise<Uint8Array> {
    const output = await this.getObject(request);
    assertDefined(
      output.Body,
      `S3 object s3://${request.bucketName}/${request.objectKey} has no body`,
    );
    return await buffer(output.Body);
  }

  private async getObject(
    request: SimLambdaCodeStoreRequest,
  ): Promise<{ Body?: Readable }> {
    try {
      return await this.properties.s3.getObject(
        { input: { Bucket: request.bucketName, Key: request.objectKey } },
        this.callerOptions(request),
      );
    } catch (error) {
      throw this.wrapS3LookupError(error);
    }
  }

  private callerOptions(
    request: SimLambdaCodeStoreRequest,
  ): { caller: SimAwsCaller } | undefined {
    if (request.caller === undefined) {
      return undefined;
    }
    return { caller: request.caller };
  }

  /**
   * Report missing code objects the way real Lambda wraps S3 lookup errors.
   * Other errors, such as simulated IAM access denials, pass through.
   */
  private wrapS3LookupError(error: unknown): Error {
    if (!(error instanceof Error)) {
      return new Error(String(error));
    }
    if (error.name === "NoSuchBucket" || error.name === "NoSuchKey") {
      return new SimLambdaInvalidParameterValueException(
        `Error occurred while GetObject. S3 Error Code: ${error.name}. ` +
          `S3 Error Message: ${error.message}`,
      );
    }
    return error;
  }
}
