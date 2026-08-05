/**
 * The function code the screened-image queue delivers to.
 *
 * It reads the widths it is meant to produce from Parameter Store, writes one
 * rendition per width, and marks the upload ready. The queue message body is
 * the S3 event document, because the Bucket notified the queue rather than the
 * function.
 */
export const buildRenditionsCode = `
const {
  DynamoDBClient,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

const dynamoDb = new DynamoDBClient({});
const s3 = new S3Client({});
const ssm = new SSMClient({});

async function renditionWidths() {
  const read = await ssm.send(
    new GetParameterCommand({
      Name: process.env.RENDITION_WIDTHS_PARAMETER_NAME,
    }),
  );

  return read.Parameter.Value.split(",");
}

async function buildRenditions(bucket, key, widths) {
  const [, userId, uploadId] = key.split("/");
  const screened = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const bytes = await screened.Body.transformToByteArray();

  for (const width of widths) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: "renditions/" + userId + "/" + uploadId + "/" + width,
        Body: Buffer.from(bytes),
        Metadata: { width: width },
      }),
    );
  }

  await dynamoDb.send(
    new UpdateItemCommand({
      TableName: process.env.UPLOADS_TABLE_NAME,
      Key: { userId: { S: userId }, uploadId: { S: uploadId } },
      UpdateExpression: "SET #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": { S: "READY" } },
    }),
  );
}

exports.handler = async (event) => {
  const widths = await renditionWidths();

  for (const message of event.Records) {
    const notification = JSON.parse(message.body);

    for (const record of notification.Records) {
      await buildRenditions(
        record.s3.bucket.name,
        decodeURIComponent(record.s3.object.key),
        widths,
      );
    }
  }
};
`;
