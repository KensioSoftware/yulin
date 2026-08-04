/**
 * The five functions the pipeline is made of, each with the execution role and
 * the configuration its own step needs.
 */

import { CreateFunctionCommand } from "@aws-sdk/client-lambda";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { makeLambdaCodeZip } from "../../src/service/lambda/function/code/make-lambda-code-zip.js";
import { buildRenditionsCode } from "./handler/build-renditions.code.js";
import { uploadStatusCode } from "./handler/upload-status.code.js";
import { publishRenditionCode } from "./handler/publish-rendition.code.js";
import { requestUploadCode } from "./handler/request-upload.code.js";
import { screenUploadCode } from "./handler/screen-upload.code.js";
import {
  mediaBucketName,
  mediaTableName,
  renditionWidthsParameterName,
} from "./media-pipeline-names.js";
import type { MediaPipelineRoles } from "./media-pipeline-roles.js";

/**
 * The environment variable names the function code reads its configuration
 * from.
 *
 * They are written as pairs rather than as object keys because the AWS-shaped
 * upper case names are not the shape this project's own identifiers take.
 */
const uploadsTableVariable = "UPLOADS_TABLE_NAME";
const mediaBucketVariable = "MEDIA_BUCKET_NAME";
const renditionWidthsVariable = "RENDITION_WIDTHS_PARAMETER_NAME";
const deliveryDomainVariable = "DELIVERY_DOMAIN_NAME";

export const requestUploadFunctionName = "request-upload";
export const screenUploadFunctionName = "screen-upload";
export const buildRenditionsFunctionName = "build-renditions";
export const uploadStatusFunctionName = "upload-status";
export const publishRenditionFunctionName = "publish-rendition";

/**
 * The ARNs of the functions other resources have to be pointed at.
 */
export interface MediaPipelineFunctions {
  readonly screenUploadArn: string;
  readonly requestUploadArn: string;
  readonly uploadStatusArn: string;
  readonly publishRenditionArn: string;
}

interface MediaPipelineFunctionProperties {
  readonly simAws: SimAws;
  readonly roles: MediaPipelineRoles;
  readonly deliveryDomainName: string;
}

/**
 * Create every function in the pipeline.
 */
export async function createMediaPipelineFunctions(
  properties: MediaPipelineFunctionProperties,
): Promise<MediaPipelineFunctions> {
  const { simAws, roles, deliveryDomainName } = properties;

  const requestUploadArn = await createFunction(simAws, {
    functionName: requestUploadFunctionName,
    roleArn: roles.requestUpload,
    code: requestUploadCode,
    variables: [[uploadsTableVariable, mediaTableName]],
  });

  const screenUploadArn = await createFunction(simAws, {
    functionName: screenUploadFunctionName,
    roleArn: roles.screenUpload,
    code: screenUploadCode,
    variables: [[uploadsTableVariable, mediaTableName]],
  });

  await createFunction(simAws, {
    functionName: buildRenditionsFunctionName,
    roleArn: roles.buildRenditions,
    code: buildRenditionsCode,
    variables: [
      [uploadsTableVariable, mediaTableName],
      [renditionWidthsVariable, renditionWidthsParameterName],
    ],
  });

  const uploadStatusArn = await createFunction(simAws, {
    functionName: uploadStatusFunctionName,
    roleArn: roles.uploadStatus,
    code: uploadStatusCode,
    variables: [
      [uploadsTableVariable, mediaTableName],
      [mediaBucketVariable, mediaBucketName],
      [deliveryDomainVariable, deliveryDomainName],
    ],
  });

  const publishRenditionArn = await createFunction(simAws, {
    functionName: publishRenditionFunctionName,
    roleArn: roles.publishRendition,
    code: publishRenditionCode,
    variables: [
      [uploadsTableVariable, mediaTableName],
      [mediaBucketVariable, mediaBucketName],
      [deliveryDomainVariable, deliveryDomainName],
    ],
  });

  return {
    requestUploadArn,
    screenUploadArn,
    uploadStatusArn,
    publishRenditionArn,
  };
}

interface FunctionProperties {
  readonly functionName: string;
  readonly roleArn: string;
  readonly code: string;
  readonly variables: readonly (readonly [string, string])[];
}

/**
 * Create one zip-packaged function, and answer with its ARN.
 */
async function createFunction(
  simAws: SimAws,
  properties: FunctionProperties,
): Promise<string> {
  const created = await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: properties.functionName,
      Role: properties.roleArn,
      Handler: "index.handler",
      Runtime: "nodejs22.x",
      Environment: { Variables: Object.fromEntries(properties.variables) },
      Code: { ZipFile: makeLambdaCodeZip(properties.code) },
    }),
  );

  assertNonNullable(
    created.FunctionArn,
    `CreateFunction answered with an ARN for ${properties.functionName}`,
  );

  return created.FunctionArn;
}
