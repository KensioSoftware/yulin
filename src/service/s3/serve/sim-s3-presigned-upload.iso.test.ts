import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  presignBucketName,
  presignSimulation,
} from "../../../../test/s3/presign-simulation.js";

/**
 * Uploads through a presigned PUT URL, and the checksum trap that comes with
 * them.
 *
 * The AWS SDK computes a checksum when it presigns, which is before there is a
 * body, and hoists it into the URL where the signature covers it. Real S3 then
 * compares it against whatever is uploaded and refuses the mismatch. Simulating
 * that is the difference between a test that proves an upload link works and
 * one that proves it works here.
 */
describe("Uploading through a presigned simulated S3 URL", () => {
  it("refuses a body that does not match the checksum the SDK hoisted", async () => {
    // Given a URL presigned by a client left on its default checksum setting
    const { client, http } = await presignSimulation({
      requestChecksumCalculation: "WHEN_SUPPORTED",
    });
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: presignBucketName, Key: "notes.txt" }),
      { expiresIn: 900 },
    );

    // When something is uploaded through it
    const response = await http.fetch(url, {
      method: "PUT",
      body: "content the URL was not signed for",
    });

    // Then it is refused, exactly as real S3 refuses it, and the response says
    // which client setting avoids it
    assertIdentical(response.status, 400);
    const body = await response.text();
    expect(body).toMatch(/<Code>XAmzContentChecksumMismatch<\/Code>/);
    expect(body).toMatch(/WHEN_REQUIRED/);
  });

  it("accepts an upload whose body matches the hoisted checksum", async () => {
    // Given the same URL, and the empty body its checksum was computed over
    const { client, http, simAws } = await presignSimulation({
      requestChecksumCalculation: "WHEN_SUPPORTED",
    });
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: presignBucketName, Key: "empty.txt" }),
      { expiresIn: 900 },
    );

    // When an empty Object is uploaded
    const response = await http.fetch(url, { method: "PUT" });

    // Then the checksum agrees and the Object is stored
    assertIdentical(response.status, 200);
    const stored = await simAws
      .s3()
      .getSimBucketByName(presignBucketName)
      ?.getObject("empty.txt");
    assertIdentical(stored?.body.length, 0);
  });

  it("keeps the content type the upload was sent with", async () => {
    // Given a presigned upload URL
    const { client, http, userArn } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: presignBucketName, Key: "report.csv" }),
      { expiresIn: 900 },
    );

    // When a body is uploaded with a content type
    await http.fetch(url, {
      method: "PUT",
      body: "a,b\n1,2\n",
      headers: { "content-type": "text/csv" },
    });

    // Then the stored Object is served back with it
    const response = await http.fetch(
      `http://${presignBucketName}.s3.eu-west-2.sim-aws.localhost/report.csv`,
      { headers: { "x-sim-aws-caller": userArn } },
    );
    assertIdentical(response.headers.get("content-type"), "text/csv");
  });
});
