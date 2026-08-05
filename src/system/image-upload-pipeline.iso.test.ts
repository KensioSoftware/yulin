import { GetObjectCommand, ListObjectsCommand } from "@aws-sdk/client-s3";
import {
  assertArrayEquals,
  assertArrayLength,
  assertBufferEqual,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  mediaBucketName,
  publishedKey,
  renditionKey,
  renditionsPrefix,
  renditionWidths,
  screenedPrefix,
} from "../../test/media-pipeline/media-pipeline-names.js";
import { mediaPipelineFactory } from "../../test/media-pipeline/media-pipeline.factory.js";
import { SimAws } from "../service/aws/sim-aws.js";
import { simS3BodyToBuffer } from "../service/s3/storage/s3-body-buffer.js";
import { simRekognitionSampleImages } from "../service/rekognition/index.js";

const widestWidth = Math.max(...renditionWidths);

/**
 * The user id is the pool subject the API took out of the token, which the
 * upload key it answered with already carries.
 */
function userIdOf(uploadKey: string): string {
  const [, userId = ""] = uploadKey.split("/");

  return userId;
}

/**
 * The keys in the Bucket under one prefix.
 */
async function keysUnder(
  simAws: SimAws,
  prefix: string,
): Promise<readonly string[]> {
  const listed = await simAws.s3().listObjects(
    new ListObjectsCommand({
      Bucket: mediaBucketName,
      Prefix: prefix,
    }),
  );

  return (listed.Contents ?? []).map((object) => object.Key ?? "");
}

/**
 * The bytes of one Object in the Bucket.
 */
async function objectBytes(simAws: SimAws, key: string): Promise<Buffer> {
  const read = await simAws
    .s3()
    .getObject(new GetObjectCommand({ Bucket: mediaBucketName, Key: key }));

  assertNonNullable(read.Body, `The Object at ${key} has a body`);

  return await simS3BodyToBuffer(read.Body);
}

describe("An image upload pipeline spanning several simulated AWS services", () => {
  it("turns an accepted upload into renditions the user can publish", async () => {
    // Given a deployed pipeline with one user signed in to it
    const simAws = new SimAws();
    const { client } = await mediaPipelineFactory.make({}, simAws);
    const image = Buffer.from(simRekognitionSampleImages.passesModeration());

    // When they ask the API for somewhere to put an image
    const requested = await client.requestUpload();
    const userId = userIdOf(requested.uploadKey);

    // And put an image that passes screening there
    await client.putBytes(requested.uploadKey, image);

    // And the screening, queueing and rendition building it sets off settle
    await simAws.backgroundTasksComplete();

    // Then the upload is ready, with one rendition per configured width
    const upload = await client.getUpload(requested.uploadId);

    assertIdentical(upload.status, "READY");
    assertFalse(upload.published);
    assertArrayEquals(
      upload.renditions.map((rendition) => rendition.width),
      [...renditionWidths],
    );

    // And the URLs it reports serve those renditions through the Distribution
    const [smallest] = upload.renditions;
    assertNonNullable(smallest, "There is a rendition to fetch");

    const delivered = await client.fetchDelivered(smallest.url);

    assertResponseStatus(delivered, 200);
    assertBufferEqual(Buffer.from(await delivered.arrayBuffer()), image);

    // When the user publishes the widest rendition
    const published = await client.publish(requested.uploadId, widestWidth);

    assertResponseStatus(published, 200);

    // Then that rendition is the one Object under their published key
    assertArrayEquals(await keysUnder(simAws, "published/"), [
      publishedKey(userId),
    ]);
    assertBufferEqual(await objectBytes(simAws, publishedKey(userId)), image);

    // And the record of the upload says they have published one
    const afterwards = await client.getUpload(requested.uploadId);

    assertTrue(afterwards.published);
  });

  it("stops an upload that fails screening before anything is built from it", async () => {
    // Given a deployed pipeline with one user signed in to it
    const simAws = new SimAws();
    const { client } = await mediaPipelineFactory.make({}, simAws);

    // When they put an image that fails screening where the API said to
    const requested = await client.requestUpload();
    const userId = userIdOf(requested.uploadKey);

    await client.putBytes(
      requested.uploadKey,
      simRekognitionSampleImages.flaggedByModeration(),
    );
    await simAws.backgroundTasksComplete();

    // Then the upload is rejected, with nothing built from it
    const upload = await client.getUpload(requested.uploadId);

    assertIdentical(upload.status, "REJECTED");
    assertArrayLength(upload.renditions, 0);

    // And it never reached the screened prefix the queue is notified for, so
    // the rest of the pipeline was never asked to do anything
    assertArrayLength(await keysUnder(simAws, screenedPrefix), 0);

    // And there is nothing to publish
    const refused = await client.publish(requested.uploadId, widestWidth);

    assertResponseStatus(refused, 409);
    assertArrayLength(await keysUnder(simAws, publishedKey(userId)), 0);
  });

  it("refuses a request that carries no token", async () => {
    // Given a deployed pipeline
    const simAws = new SimAws();
    const { client } = await mediaPipelineFactory.make({}, simAws);

    // When an upload is asked for without signing in
    const response = await client.request({
      method: "POST",
      path: "/uploads",
      authorized: false,
    });

    // Then the API refuses it before any function runs
    assertResponseStatus(response, 401);
    assertIdentical(response.headers.get("www-authenticate"), "Bearer");
  });

  it("builds what Parameter Store says to build, not what the code says", async () => {
    // Given a deployed pipeline configured to build one rendition width
    const simAws = new SimAws();
    const { client } = await mediaPipelineFactory.make(
      { renditionWidths: "128" },
      simAws,
    );

    // When an image that passes screening goes through it
    const requested = await client.requestUpload();

    await client.putBytes(
      requested.uploadKey,
      simRekognitionSampleImages.passesModeration(),
    );
    await simAws.backgroundTasksComplete();

    // Then the one configured width is the only rendition built
    const upload = await client.getUpload(requested.uploadId);
    const userId = userIdOf(requested.uploadKey);

    assertArrayEquals(
      upload.renditions.map((rendition) => rendition.width),
      [128],
    );
    assertArrayEquals(
      await keysUnder(simAws, `${renditionsPrefix}${userId}/`),
      [renditionKey(userId, requested.uploadId, 128)],
    );
  });
});
