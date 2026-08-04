/**
 * The function code the Bucket notifies when an upload arrives.
 *
 * It asks Rekognition what is in the image. A clean image is copied under the
 * screened prefix, which is the notification the rest of the pipeline runs
 * from; a flagged one stops here and the upload is marked rejected.
 */
export const screenUploadCode = `
const {
  DynamoDBClient,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const {
  RekognitionClient,
  DetectModerationLabelsCommand,
} = require("@aws-sdk/client-rekognition");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");

const dynamoDb = new DynamoDBClient({});
const rekognition = new RekognitionClient({});
const s3 = new S3Client({});

/**
 * An upload key is incoming/<userId>/<uploadId>, so it carries everything
 * needed to find the record the upload belongs to.
 */
function readKey(key) {
  const [, userId, uploadId] = key.split("/");
  return { userId, uploadId };
}

async function reject(userId, uploadId) {
  await dynamoDb.send(
    new UpdateItemCommand({
      TableName: process.env.UPLOADS_TABLE_NAME,
      Key: { userId: { S: userId }, uploadId: { S: uploadId } },
      // "status" is a DynamoDB reserved word, so it goes in by name.
      UpdateExpression: "SET #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": { S: "REJECTED" } },
    }),
  );
}

async function accept(bucket, key, userId, uploadId) {
  const uploaded = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: "screened/" + userId + "/" + uploadId,
      Body: Buffer.from(await uploaded.Body.transformToByteArray()),
    }),
  );
}

exports.handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key);
    const { userId, uploadId } = readKey(key);

    const detected = await rekognition.send(
      new DetectModerationLabelsCommand({
        Image: { S3Object: { Bucket: bucket, Name: key } },
      }),
    );

    if (detected.ModerationLabels.length > 0) {
      await reject(userId, uploadId);
      continue;
    }

    await accept(bucket, key, userId, uploadId);
  }
};
`;
