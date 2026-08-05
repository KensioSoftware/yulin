import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimIamPolicyDocumentStatement } from "../../src/service/iam/policy/sim-iam-policy.js";
import type { SimLambdaFunction } from "../../src/service/lambda/function/sim-lambda-function.js";
import { buildRenditionsCode } from "./handler/build-renditions.code.js";
import { publishRenditionCode } from "./handler/publish-rendition.code.js";
import { requestUploadCode } from "./handler/request-upload.code.js";
import { screenUploadCode } from "./handler/screen-upload.code.js";
import { uploadStatusCode } from "./handler/upload-status.code.js";
import { mediaExecutionRoleFactory } from "./media-execution-role.factory.js";
import {
  buildRenditionsFunctionName,
  deliveryDomainVariable,
  mediaBucketVariable,
  publishRenditionFunctionName,
  renditionWidthsVariable,
  requestUploadFunctionName,
  screenUploadFunctionName,
  uploadsTableVariable,
  uploadStatusFunctionName,
} from "./media-pipeline-names.js";
import { mediaPipelineFunctionFactory } from "./media-pipeline-function.factory.js";
import { mediaPipelinePermissions } from "./media-pipeline-permissions.js";

/**
 * The names the pipeline's steps read their resources by, and the ARNs they
 * are allowed to work on.
 */
export interface MediaPipelineStepsInput {
  readonly tableName: string;
  readonly tableArn: string;
  readonly bucketName: string;
  readonly bucketArn: string;
  readonly queueArn: string;
  readonly parameterName: string;
  readonly parameterArn: string;
  readonly deliveryDomainName: string;
}

/**
 * The five functions the pipeline is made of.
 */
export interface MediaPipelineSteps {
  readonly requestUpload: SimLambdaFunction;
  readonly screenUpload: SimLambdaFunction;
  readonly buildRenditions: SimLambdaFunction;
  readonly uploadStatus: SimLambdaFunction;
  readonly publishRendition: SimLambdaFunction;
}

/**
 * Creates every function of the pipeline, each running as an execution role
 * allowed only what its own step does.
 *
 * ```typescript
 * const steps = await mediaPipelineStepsFactory.make({ tableArn }, simAws);
 * ```
 *
 * The permissions each one gets are in
 * [media-pipeline-permissions.ts](./media-pipeline-permissions.ts).
 */
export const mediaPipelineStepsFactory = new AsyncMappedFactory<
  MediaPipelineStepsInput,
  MediaPipelineSteps,
  SimAws
>(
  () => ({
    tableName: "ImageUploads",
    tableArn: "",
    bucketName: "image-uploads",
    bucketArn: "",
    queueArn: "",
    parameterName: "/images/live/rendition-widths",
    parameterArn: "",
    deliveryDomainName: "",
  }),
  async (input, simAws) => {
    const allowed = mediaPipelinePermissions(input);
    const table: readonly (readonly [string, string])[] = [
      [uploadsTableVariable, input.tableName],
    ];
    const delivery: readonly (readonly [string, string])[] = [
      ...table,
      [mediaBucketVariable, input.bucketName],
      [deliveryDomainVariable, input.deliveryDomainName],
    ];

    return {
      requestUpload: await createStep(simAws, {
        roleName: "RequestUploadRole",
        statements: allowed.requestUpload,
        functionName: requestUploadFunctionName,
        code: requestUploadCode,
        variables: table,
      }),
      screenUpload: await createStep(simAws, {
        roleName: "ScreenUploadRole",
        statements: allowed.screenUpload,
        functionName: screenUploadFunctionName,
        code: screenUploadCode,
        variables: table,
      }),
      buildRenditions: await createStep(simAws, {
        roleName: "BuildRenditionsRole",
        statements: allowed.buildRenditions,
        functionName: buildRenditionsFunctionName,
        code: buildRenditionsCode,
        variables: [...table, [renditionWidthsVariable, input.parameterName]],
      }),
      uploadStatus: await createStep(simAws, {
        roleName: "UploadStatusRole",
        statements: allowed.uploadStatus,
        functionName: uploadStatusFunctionName,
        code: uploadStatusCode,
        variables: delivery,
      }),
      publishRendition: await createStep(simAws, {
        roleName: "PublishRenditionRole",
        statements: allowed.publishRendition,
        functionName: publishRenditionFunctionName,
        code: publishRenditionCode,
        variables: delivery,
      }),
    };
  },
);

/**
 * One step of the pipeline: a function, and what it is allowed to do.
 */
interface MediaPipelineStep {
  readonly roleName: string;
  readonly statements: readonly SimIamPolicyDocumentStatement[];
  readonly functionName: string;
  readonly code: string;
  readonly variables: readonly (readonly [string, string])[];
}

/**
 * Create a step's execution role and the function that runs as it.
 */
async function createStep(
  simAws: SimAws,
  step: MediaPipelineStep,
): Promise<SimLambdaFunction> {
  const roleArn = await mediaExecutionRoleFactory.make(
    { roleName: step.roleName, statements: step.statements },
    simAws,
  );

  return mediaPipelineFunctionFactory.make(
    {
      functionName: step.functionName,
      roleArn,
      code: step.code,
      variables: step.variables,
    },
    simAws,
  );
}
