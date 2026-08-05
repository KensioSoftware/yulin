/**
 * The function code behind `POST /uploads/{uploadId}/published`.
 *
 * It copies the width the client picked to the one published key that user
 * has, and records that they now have one. An upload that never became ready
 * has nothing to publish, so it is refused.
 */
export const publishRenditionCode = `
const {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");

const dynamoDb = new DynamoDBClient({});
const s3 = new S3Client({});

function refusal(statusCode, message) {
  return {
    statusCode: statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: message }),
  };
}

async function publish(bucket, renditionKey, publishedKey) {
  const rendition = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: renditionKey }),
  );

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: publishedKey,
      Body: Buffer.from(await rendition.Body.transformToByteArray()),
    }),
  );
}

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims.sub;
  const uploadId = event.pathParameters.uploadId;
  const width = JSON.parse(event.body).width;

  const read = await dynamoDb.send(
    new GetItemCommand({
      TableName: process.env.UPLOADS_TABLE_NAME,
      Key: { userId: { S: userId }, uploadId: { S: uploadId } },
    }),
  );

  if (read.Item === undefined) {
    return refusal(404, "No such upload");
  }

  if (read.Item.status.S !== "READY") {
    return refusal(409, "That upload has no renditions to publish");
  }

  const publishedKey = "published/" + userId;

  await publish(
    process.env.MEDIA_BUCKET_NAME,
    "renditions/" + userId + "/" + uploadId + "/" + width,
    publishedKey,
  );

  await dynamoDb.send(
    new UpdateItemCommand({
      TableName: process.env.UPLOADS_TABLE_NAME,
      Key: { userId: { S: userId }, uploadId: { S: uploadId } },
      UpdateExpression: "SET published = :published",
      ExpressionAttributeValues: { ":published": { BOOL: true } },
    }),
  );

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: "https://" + process.env.DELIVERY_DOMAIN_NAME + "/" + publishedKey,
    }),
  };
};
`;
