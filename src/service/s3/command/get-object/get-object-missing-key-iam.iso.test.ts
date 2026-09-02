import { PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  assertBufferEqual,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { SimSdk } from "../../../../sdk/sim-sdk.js";
import { SimS3NoSuchKey } from "../../error/sim-s3.error.js";
import type { SimS3 } from "../../sim-s3.js";
import { simS3BodyToBuffer } from "../../storage/s3-body-buffer.js";

/**
 * What S3 answers for a key that is not there depends on a second permission.
 *
 * A caller allowed `s3:GetObject` and nothing else is told the same thing
 * whether or not the Object exists, because admitting the absence would tell
 * it something a listing would have told it. `s3:ListBucket` on the Bucket is
 * what buys the difference.
 */
describe("S3 GetObject on a key that is not there", () => {
  const bucketName = "quarterly-reports";

  it("refuses a reader that may not list the Bucket", async () => {
    // Given a reader allowed to get Objects from a Bucket and nothing else.
    const simAws = new SimAws();
    const simS3 = await bucketFor(simAws);
    const readerArn = await objectReaderArn(simAws);

    // When it asks for a key the Bucket does not hold.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({ Bucket: bucketName, Key: "q4/report.pdf" }),
        { caller: { kind: "arn", arn: readerArn } },
      ),
    );

    // Then S3 refuses rather than saying the key is missing, and names the
    // listing permission that would have let it say so.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.$metadata.httpStatusCode, 403);
    assertIdentical(error.action, "s3:ListBucket");
    assertIdentical(error.resource, `arn:aws:s3:::${bucketName}`);
  });

  it("admits the key is missing once the reader may list the Bucket", async () => {
    // Given the same reader, now also allowed to list the Bucket.
    const simAws = new SimAws();
    const simS3 = await bucketFor(simAws);
    const readerArn = await objectReaderArn(simAws);
    await allowBucketListing(simAws);

    // When it asks for a key the Bucket does not hold.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.getObject(
        new GetObjectCommand({ Bucket: bucketName, Key: "q4/report.pdf" }),
        { caller: { kind: "arn", arn: readerArn } },
      ),
    );

    // Then the absence is what comes back, which is the error a caller
    // handling an optional Object catches.
    assertInstanceOf(error, SimS3NoSuchKey);
    assertIdentical(error.$metadata.httpStatusCode, 404);
  });

  it("serves an Object that is there to a reader holding no listing permission", async () => {
    // Given an Object in the Bucket and a reader allowed only to get Objects.
    const simAws = new SimAws();
    const simS3 = await bucketFor(simAws);
    const readerArn = await objectReaderArn(simAws);
    await simS3.putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "q3/report.pdf",
        Body: "quarterly numbers",
      }),
    );

    // When it asks for that Object.
    const output = await simS3.getObject(
      new GetObjectCommand({ Bucket: bucketName, Key: "q3/report.pdf" }),
      { caller: { kind: "arn", arn: readerArn } },
    );

    // Then reading an Object it can already name takes `s3:GetObject` alone.
    assertBufferEqual(
      await simS3BodyToBuffer(output.Body as AsyncIterable<Buffer>),
      Buffer.from("quarterly numbers"),
    );
  });

  it("answers an intercepted SDK client the same way", async () => {
    // Given an AWS SDK client whose commands go to the simulation, sending as
    // a reader that may not list the Bucket.
    const simAws = new SimAws();
    using simSdk = new SimSdk({ simAws });
    await bucketFor(simAws);
    const readerArn = await objectReaderArn(simAws);

    const client = new S3Client({ region: simAws.defaultRegionName });
    simSdk.intercept(client);

    // When it asks for a key the Bucket does not hold.
    const error = await simAws.runAs(
      { kind: "arn", arn: readerArn },
      async () =>
        await assertThrowsErrorAsync(async () =>
          client.send(
            new GetObjectCommand({ Bucket: bucketName, Key: "q4/report.pdf" }),
          ),
        ),
    );

    // Then the code under test sees the name and status a deployed client
    // would see rather than a missing-key error it never gets in AWS.
    assertIdentical(error.name, "AccessDenied");
    assertIdentical(
      (error as SimIamAccessDenied).$metadata.httpStatusCode,
      403,
    );
  });

  /**
   * A Bucket in its own simulated AWS, in the Region the tests read from.
   */
  async function bucketFor(simAws: SimAws): Promise<SimS3> {
    const simS3 = simAws.s3();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: bucketName }));

    return simS3;
  }

  /**
   * A Role allowed to read the Bucket's Objects and to do nothing else.
   */
  async function objectReaderArn(simAws: SimAws): Promise<string> {
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "ReportReader",
        actions: ["s3:GetObject"],
        resource: `arn:aws:s3:::${bucketName}/*`,
      },
      simAws,
    );

    return role.Arn;
  }

  /**
   * Grant that Role the Bucket listing its Objects sit under.
   */
  async function allowBucketListing(simAws: SimAws): Promise<void> {
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ReportReader",
        PolicyName: "ListReports",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "s3:ListBucket",
            Resource: `arn:aws:s3:::${bucketName}`,
          },
        }),
      }),
    );
  }
});
