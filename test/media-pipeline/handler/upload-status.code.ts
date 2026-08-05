/**
 * The function code behind `GET /uploads/{uploadId}`.
 *
 * It answers with where the upload got to and, once there are any, the
 * delivery URLs of its renditions. The URLs are built from the distribution
 * domain rather than the Bucket, because that is what a client is given.
 */
export const uploadStatusCode = `
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, ListObjectsCommand } = require("@aws-sdk/client-s3");

const dynamoDb = new DynamoDBClient({});
const s3 = new S3Client({});

async function renditions(userId, uploadId) {
  const listed = await s3.send(
    new ListObjectsCommand({
      Bucket: process.env.MEDIA_BUCKET_NAME,
      Prefix: "renditions/" + userId + "/" + uploadId + "/",
    }),
  );

  return (listed.Contents || []).map((object) => ({
    width: Number(object.Key.split("/").pop()),
    url: "https://" + process.env.DELIVERY_DOMAIN_NAME + "/" + object.Key,
  }));
}

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims.sub;
  const uploadId = event.pathParameters.uploadId;

  const read = await dynamoDb.send(
    new GetItemCommand({
      TableName: process.env.UPLOADS_TABLE_NAME,
      Key: { userId: { S: userId }, uploadId: { S: uploadId } },
    }),
  );

  if (read.Item === undefined) {
    return {
      statusCode: 404,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "No such upload" }),
    };
  }

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status: read.Item.status.S,
      published: read.Item.published.BOOL,
      renditions: await renditions(userId, uploadId),
    }),
  };
};
`;
