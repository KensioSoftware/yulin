import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimLambdaHandler } from "../sim-lambda-handler.type.js";
import { LambdaZipFileStowaway } from "./lambda-zip-file-input.js";

/**
 * Minimal structural Lambda function code input, as on CreateFunction.
 */
export interface SimLambdaCodeInput {
  ZipFile?: Uint8Array | undefined;
  S3Bucket?: string | undefined;
  S3Key?: string | undefined;
  S3ObjectVersion?: string | undefined;
  ImageUri?: string | undefined;
}

/**
 * Function code given as a real handler function reference, stowed away
 * through the SDK-shaped ZipFile input by makeLambdaZipFileInput.
 */
export interface SimLambdaHandlerReferenceSource {
  readonly kind: "handler-reference";
  readonly handlerFunction: SimLambdaHandler;
}

/**
 * Function code given as real zip archive bytes on the request, as the
 * CreateFunction Code.ZipFile input carries on real AWS.
 */
export interface SimLambdaZipBytesSource {
  readonly kind: "zip-bytes";
  readonly zipBytes: Uint8Array;
}

/**
 * Function code stored as a zip archive object in sim S3, as the
 * CreateFunction Code.S3Bucket/S3Key input references on real AWS.
 */
export interface SimLambdaS3LocationSource {
  readonly kind: "s3-location";
  readonly bucketName: string;
  readonly objectKey: string;
}

/**
 * Function code given as a container image URI, as a function with
 * PackageType Image names on real AWS.
 *
 * The URI is only ever an identifier here. What runs is whatever simulated ECR
 * holds under the repository it names, which is resolved when the function is
 * created, as real Lambda resolves the image then too.
 */
export interface SimLambdaContainerImageSource {
  readonly kind: "container-image";
  readonly imageUri: string;
}

/**
 * The validated source of a sim Lambda function's code.
 */
export type SimLambdaCodeSource =
  | SimLambdaHandlerReferenceSource
  | SimLambdaZipBytesSource
  | SimLambdaS3LocationSource
  | SimLambdaContainerImageSource;

/**
 * Validate CreateFunction code input into a sim Lambda code source.
 *
 * Exactly one of ZipFile, an S3 object location or a container image URI must
 * be given, as on real AWS. S3ObjectVersion is accepted but ignored, as sim S3
 * does not simulate object versioning yet.
 */
export function requireLambdaCodeSource(
  code: SimLambdaCodeInput | undefined,
): SimLambdaCodeSource {
  assertDefined(code, "CreateFunctionCommand.input.Code required");

  if (code.ImageUri !== undefined) {
    return containerImageSource(code.ImageUri, code);
  }
  if (code.ZipFile !== undefined) {
    return zipFileSource(code.ZipFile, code);
  }
  if (code.S3Bucket !== undefined || code.S3Key !== undefined) {
    return s3LocationSource(code);
  }
  throw new SimLambdaInvalidParameterValueException(
    "CreateFunctionCommand.input.Code requires either ZipFile bytes, an " +
      "S3Bucket and S3Key object location, or an ImageUri",
  );
}

/**
 * A container image function names its image and nothing else, as on real
 * AWS, where an image function has no zip code to also name.
 */
function containerImageSource(
  imageUri: string,
  code: SimLambdaCodeInput,
): SimLambdaContainerImageSource {
  if (
    code.ZipFile !== undefined ||
    code.S3Bucket !== undefined ||
    code.S3Key !== undefined
  ) {
    throw new SimLambdaInvalidParameterValueException(
      "Please do not provide ZipFile bytes or an S3 object location when " +
        "using Code.ImageUri",
    );
  }

  return { kind: "container-image", imageUri };
}

function zipFileSource(
  zipFile: Uint8Array,
  code: SimLambdaCodeInput,
): SimLambdaCodeSource {
  if (code.S3Bucket !== undefined || code.S3Key !== undefined) {
    throw new SimLambdaInvalidParameterValueException(
      "Please do not provide an S3 object location when using Code.ZipFile",
    );
  }
  if (zipFile instanceof LambdaZipFileStowaway) {
    return {
      kind: "handler-reference",
      handlerFunction: zipFile.handlerFunction,
    };
  }
  return { kind: "zip-bytes", zipBytes: zipFile };
}

function s3LocationSource(code: SimLambdaCodeInput): SimLambdaS3LocationSource {
  assertDefined(
    code.S3Bucket,
    "CreateFunctionCommand.input.Code.S3Bucket required with S3Key",
  );
  assertDefined(
    code.S3Key,
    "CreateFunctionCommand.input.Code.S3Key required with S3Bucket",
  );
  return {
    kind: "s3-location",
    bucketName: code.S3Bucket,
    objectKey: code.S3Key,
  };
}
