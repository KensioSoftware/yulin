import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CopyObjectCommand,
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCopyCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * Copying an Object over the served S3 REST endpoint.
 *
 * Real S3 states a copy as a `PUT` on the destination carrying the source in a
 * header and no bytes at all, which is a request the endpoint would otherwise
 * read as an upload of nothing. What these cover is the operation reached
 * through that request rather than through the simulator: the header, the
 * document the copy answers with, and what a refused copy leaves behind.
 */
describe("Copying an Object over the served S3 REST endpoint", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });
  const simS3 = simAws.s3();

  const report = "the bytes a copy is supposed to move";

  let client: S3Client;
  let userArn: string;

  beforeAll(async () => {
    await srv.listen();

    client = await s3ClientFor("Copier");

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "inbox" }));
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "archive" }));
  });

  afterAll(async () => {
    await srv.close();
  });

  /**
   * A client signing as a simulated IAM user allowed to do anything to S3, so
   * a refusal in these comes from a Bucket policy rather than from the
   * identity.
   */
  async function s3ClientFor(username: string): Promise<S3Client> {
    const simIam = simAws.iam();

    const user = await simIam.createUser(
      new CreateUserCommand({ UserName: username }),
    );
    assertDefined(user.User.Arn, "the created user's ARN");
    userArn = user.User.Arn;

    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: username,
        PolicyName: "Copies",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: username }),
    );

    return new S3Client({
      region: simAws.defaultRegionName,
      endpoint: `http://localhost:${srv.port}`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: created.AccessKey.AccessKeyId,
        secretAccessKey: created.AccessKey.SecretAccessKey,
      },
    });
  }

  /**
   * Lay down an Object for one of these to copy, under a key of its own so the
   * tests do not read each other's leftovers.
   */
  async function givenReport(key: string): Promise<void> {
    await simS3.putObject(
      new PutObjectCommand({ Bucket: "inbox", Key: key, Body: report }),
    );
  }

  /**
   * The text an Object holds, read through the simulator rather than through
   * the endpoint under test.
   */
  async function storedText(bucketName: string, key: string): Promise<string> {
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    assertDefined(read.Body, "the stored Object body");

    return Buffer.concat(await Array.fromAsync(read.Body)).toString("utf8");
  }

  it("copies the bytes, and says what it wrote in the response body", async () => {
    // Given an Object in one Bucket
    await givenReport("plain.txt");

    // When it is copied into another through the endpoint
    const copy = await client.send(
      new CopyObjectCommand({
        Bucket: "archive",
        Key: "2026/plain.txt",
        CopySource: "/inbox/plain.txt",
      }),
    );

    // Then the destination holds the source's bytes, rather than the empty
    // body the request carried
    assertIdentical(await storedText("archive", "2026/plain.txt"), report);

    // And the ETag and write time came back in the document a copy answers
    // with, which is the only place a client can read them, describing the
    // Object that was written rather than being made up by the endpoint
    const listed = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "archive", Prefix: "2026/plain.txt" }),
    );
    const written = listed.Contents?.[0];
    assertDefined(written, "the written Object");

    const result = copy.CopyObjectResult;
    assertDefined(result, "the copy result");
    assertIdentical(result.ETag, written.ETag);
    assertIdentical(
      result.LastModified?.getTime(),
      written.LastModified?.getTime(),
    );
  });

  it("still reads a PUT carrying bytes as an upload", async () => {
    // Given the request that shares its method and path with a copy and names
    // no source
    await client.send(
      new PutObjectCommand({
        Bucket: "archive",
        Key: "uploaded.txt",
        Body: "written directly",
      }),
    );

    // Then it stored what it carried, rather than being read as a copy of
    // nothing
    assertIdentical(
      await storedText("archive", "uploaded.txt"),
      "written directly",
    );
  });

  it("reads a source key holding a space and a slash", async () => {
    // Given a key whose own text has to be encoded to travel in a header
    await givenReport("quarterly report/q1 & q2.txt");

    // When it is copied by that name
    await client.send(
      new CopyObjectCommand({
        Bucket: "archive",
        Key: "encoded.txt",
        CopySource: "/inbox/quarterly report/q1 & q2.txt",
      }),
    );

    // Then the encoded source named the Object it meant, rather than one whose
    // key holds a literal `%20`
    assertIdentical(await storedText("archive", "encoded.txt"), report);
  });

  it("carries the source's content type under the default directive", async () => {
    // Given an Object written with a content type
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "inbox",
        Key: "typed.pdf",
        Body: report,
        ContentType: "application/pdf",
      }),
    );

    // When it is copied without asking for the metadata to be replaced
    await client.send(
      new CopyObjectCommand({
        Bucket: "archive",
        Key: "typed.pdf",
        CopySource: "/inbox/typed.pdf",
      }),
    );

    // Then the copy describes itself the way the source did
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "archive", Key: "typed.pdf" }),
    );
    assertIdentical(read.ContentType, "application/pdf");
  });

  it("takes the destination's own metadata under REPLACE", async () => {
    // Given an Object written as one thing
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: "inbox",
        Key: "retyped.bin",
        Body: report,
        ContentType: "application/octet-stream",
      }),
    );

    // When it is copied asking for the request's metadata instead
    await client.send(
      new CopyObjectCommand({
        Bucket: "archive",
        Key: "retyped.txt",
        CopySource: "/inbox/retyped.bin",
        MetadataDirective: "REPLACE",
        ContentType: "text/plain",
      }),
    );

    // Then the directive reached the operation, which the header is the only
    // way of stating over REST
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "archive", Key: "retyped.txt" }),
    );
    assertIdentical(read.ContentType, "text/plain");
  });

  it("answers a copy a Bucket policy refuses with the S3 error document", async () => {
    // Given a destination Bucket whose policy denies this caller a write
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "sealed" }));
    await simS3.putBucketPolicy(
      new PutBucketPolicyCommand({
        Bucket: "sealed",
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Deny",
              Principal: { AWS: userArn },
              Action: "s3:PutObject",
              Resource: "arn:aws:s3:::sealed/*",
            },
          ],
        }),
      }),
    );
    await givenReport("refused.txt");

    // When a copy into it is attempted
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new CopyObjectCommand({
            Bucket: "sealed",
            Key: "refused.txt",
            CopySource: "/inbox/refused.txt",
          }),
        ),
    );

    // Then the SDK read it as the S3 failure it is, rather than as a copy that
    // worked
    assertIdentical(error.name, "AccessDenied");
    assertStringIncludes(error.message, "s3:PutObject");

    // And nothing was stored, which is what real S3's 200-with-an-error-body
    // makes easy to miss
    const listed = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "sealed" }),
    );
    assertArrayLength(listed.Contents ?? [], 0);
  });

  it("refuses a copy into a multipart part rather than storing an empty one", async () => {
    // Given the upload the CLI switches to above its multipart threshold
    await givenReport("large.bin");

    // When a part of it is asked to come from another Object, which simulated
    // S3 has no operation for
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new UploadPartCopyCommand({
            Bucket: "archive",
            Key: "large.bin",
            UploadId: "no-such-upload",
            PartNumber: 1,
            CopySource: "/inbox/large.bin",
          }),
        ),
    );

    // Then it is refused by name, rather than read as the part upload it looks
    // exactly like and stored as no bytes at all
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "UploadPartCopyCommand");
  });
});
