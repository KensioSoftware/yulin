/**
 * The function code behind `POST /uploads`.
 *
 * It records the upload as pending and answers with the key the client is to
 * put its bytes under. Nothing has been uploaded yet at this point, so nothing
 * downstream has happened either.
 */
export const requestUploadCode = `
const { randomUUID } = require("node:crypto");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const dynamoDb = new DynamoDBClient({});

exports.handler = async (event) => {
  const userId = event.requestContext.authorizer.jwt.claims.sub;
  const uploadId = randomUUID();

  await dynamoDb.send(
    new PutItemCommand({
      TableName: process.env.UPLOADS_TABLE_NAME,
      Item: {
        userId: { S: userId },
        uploadId: { S: uploadId },
        status: { S: "PENDING" },
        published: { BOOL: false },
      },
    }),
  );

  return {
    statusCode: 202,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      uploadId,
      uploadKey: "incoming/" + userId + "/" + uploadId,
    }),
  };
};
`;
