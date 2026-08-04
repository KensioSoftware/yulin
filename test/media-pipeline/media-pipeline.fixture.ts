/**
 * A whole simulated application, built once per test case.
 *
 * The image pipeline is a small system rather than one service: a user signs in
 * to a user pool, asks an HTTP API for somewhere to put an image, and the
 * Object appearing in the Bucket sets off screening, queueing and rendition
 * building, each step being a function running as its own execution role.
 *
 * It lives under `test/` because it is shared setup rather than a test, and
 * because a module declaring tests cannot also export helpers.
 */

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { MediaPipelineApi } from "./media-pipeline-api.js";
import {
  createMediaPipelineApi,
  createMediaPipelineUser,
  createMediaPipelineUserPool,
} from "./media-pipeline-api.js";
import { MediaPipelineClient } from "./media-pipeline-client.js";
import {
  createMediaPipelineFunctions,
  screenUploadFunctionName,
} from "./media-pipeline-functions.js";
import { createMediaPipelineRoles } from "./media-pipeline-roles.js";
import { createMediaPipelineStorage } from "./media-pipeline-storage.js";
import { wireMediaPipeline } from "./media-pipeline-wiring.js";

export const mediaPipelineUsername = "casey";
export const mediaPipelinePassword = "Correct-horse-9";

/**
 * The deployed pipeline, and a client signed in to it.
 */
export interface MediaPipeline {
  readonly simAws: SimAws;
  readonly api: MediaPipelineApi;
  readonly client: MediaPipelineClient;
  readonly queueUrl: string;
  readonly deliveryDomainName: string;
}

/**
 * Build the whole pipeline on a fresh simulated AWS, and sign one user in.
 */
export async function deployMediaPipeline(): Promise<MediaPipeline> {
  const simAws = new SimAws();

  const storage = await createMediaPipelineStorage(simAws);
  const roles = await createMediaPipelineRoles(simAws, storage.queueArn);
  const functions = await createMediaPipelineFunctions({
    simAws,
    roles,
    deliveryDomainName: storage.deliveryDomainName,
  });

  await wireMediaPipeline({
    simAws,
    screenUploadArn: functions.screenUploadArn,
    screenUploadFunctionName,
    queueArn: storage.queueArn,
    queueUrl: storage.queueUrl,
  });

  const pool = await createMediaPipelineUserPool(simAws);
  await createMediaPipelineUser(
    simAws,
    pool,
    mediaPipelineUsername,
    mediaPipelinePassword,
  );

  const api = await createMediaPipelineApi({ simAws, pool, functions });
  const client = await MediaPipelineClient.signIn(
    simAws,
    api,
    mediaPipelineUsername,
    mediaPipelinePassword,
  );

  return {
    simAws,
    api,
    client,
    queueUrl: storage.queueUrl,
    deliveryDomainName: storage.deliveryDomainName,
  };
}
