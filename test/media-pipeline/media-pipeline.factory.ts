import { CreateEventSourceMappingCommand } from "@aws-sdk/client-lambda";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { PutParameterCommand } from "@aws-sdk/client-ssm";
import { AsyncMappedFactory } from "@kensio/part-factory";

import type { SimHttpApi } from "../../src/service/apigatewayv2/api/sim-http-api.js";
import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { simCognitoSignedInFactory } from "../../src/service/cognito/user-pool/auth/sim-cognito-signed-in.factory.js";
import { mediaDeliveryDistributionFactory } from "./media-delivery-distribution.factory.js";
import { MediaPipelineClient } from "./media-pipeline-client.js";
import {
  buildRenditionsFunctionName,
  mediaApiName,
  mediaAppClientName,
  mediaBucketName,
  mediaQueueName,
  mediaTableName,
  mediaUserPoolName,
  publishRenditionFunctionName,
  renditionWidths,
  renditionWidthsParameterName,
  requestUploadFunctionName,
  uploadStatusFunctionName,
} from "./media-pipeline-names.js";
import { mediaPipelineStepsFactory } from "./media-pipeline-steps.factory.js";
import { mediaScreenedQueueFactory } from "./media-screened-queue.factory.js";
import { mediaUploadNotificationsFactory } from "./media-upload-notifications.factory.js";
import { mediaUploadsApiFactory } from "./media-uploads-api.factory.js";
import { mediaUploadsTableFactory } from "./media-uploads-table.factory.js";

/**
 * What a test asks for when it wants the whole pipeline standing up.
 *
 * The widths are here because they are the one thing a test changes about how
 * the system is configured, rather than about what it is given to process.
 * They are the comma-separated string Parameter Store holds rather than a list
 * of numbers, because overrides merge into defaults element by element, so a
 * one-width override of a two-width default would leave the second width
 * behind.
 */
export interface MediaPipelineInput {
  readonly renditionWidths: string;
  readonly username: string;
  readonly password: string;
}

/**
 * A deployed pipeline, and a client signed in to it.
 */
export interface MediaPipeline {
  readonly simAws: SimAws;
  readonly api: SimHttpApi;
  readonly client: MediaPipelineClient;
  readonly deliveryDomainName: string;
}

/**
 * Creates a whole simulated application: a user pool, an HTTP API, a Bucket
 * whose Objects set off screening and rendition building, and the Table, queue,
 * parameter and Distribution those steps work through.
 *
 * ```typescript
 * const simAws = new SimAws();
 * const { client } = await mediaPipelineFactory.make({}, simAws);
 * ```
 *
 * Everything is created through the ordinary commands, in the order a
 * deployment would create it: a notification cannot name a function that does
 * not exist yet, and a function cannot be allowed a queue that does not exist
 * yet.
 */
export const mediaPipelineFactory = new AsyncMappedFactory<
  MediaPipelineInput,
  MediaPipeline,
  SimAws
>(
  () => ({
    renditionWidths: renditionWidths.join(","),
    username: "casey",
    password: "Correct-horse-9",
  }),
  async (input, simAws) => {
    const { defaultAccountId, defaultRegionName } = simAws;

    // The Bucket comes first: the Distribution in front of it has to find it.
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: mediaBucketName }));

    const table = await mediaUploadsTableFactory.make(
      { tableName: mediaTableName },
      simAws,
    );
    const queue = await mediaScreenedQueueFactory.make(
      { queueName: mediaQueueName, sourceBucketName: mediaBucketName },
      simAws,
    );
    const deliveryDomainName = await mediaDeliveryDistributionFactory.make(
      { originBucketName: mediaBucketName },
      simAws,
    );

    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: renditionWidthsParameterName,
        Type: "StringList",
        Value: input.renditionWidths,
      }),
    );

    const steps = await mediaPipelineStepsFactory.make(
      {
        tableName: mediaTableName,
        tableArn: table.arn,
        bucketName: mediaBucketName,
        bucketArn: `arn:aws:s3:::${mediaBucketName}`,
        queueArn: queue.arn.value,
        parameterName: renditionWidthsParameterName,
        parameterArn: `arn:aws:ssm:${defaultRegionName}:${defaultAccountId}:parameter${renditionWidthsParameterName}`,
        deliveryDomainName,
      },
      simAws,
    );

    await mediaUploadNotificationsFactory.make(
      {
        bucketName: mediaBucketName,
        screeningFunctionName: steps.screenUpload.name,
        screeningFunctionArn: steps.screenUpload.arn,
        screenedQueueArn: queue.arn.value,
      },
      simAws,
    );

    await simAws.lambda().createEventSourceMapping(
      new CreateEventSourceMappingCommand({
        EventSourceArn: queue.arn.value,
        FunctionName: buildRenditionsFunctionName,
      }),
    );

    const signedIn = await simCognitoSignedInFactory.make(
      {
        poolName: mediaUserPoolName,
        clientName: mediaAppClientName,
        username: input.username,
        password: input.password,
      },
      simAws,
    );

    const api = await mediaUploadsApiFactory.make(
      {
        apiName: mediaApiName,
        issuerUrl: signedIn.issuerUrl,
        audience: signedIn.clientId,
        routes: [
          {
            routeKey: "POST /uploads",
            functionName: requestUploadFunctionName,
            functionArn: steps.requestUpload.arn,
          },
          {
            routeKey: "GET /uploads/{uploadId}",
            functionName: uploadStatusFunctionName,
            functionArn: steps.uploadStatus.arn,
          },
          {
            routeKey: "POST /uploads/{uploadId}/published",
            functionName: publishRenditionFunctionName,
            functionArn: steps.publishRendition.arn,
          },
        ],
      },
      simAws,
    );

    return {
      simAws,
      api,
      deliveryDomainName,
      client: new MediaPipelineClient({
        simAws,
        apiEndpoint: api.apiEndpoint,
        accessToken: signedIn.accessToken,
      }),
    };
  },
);
