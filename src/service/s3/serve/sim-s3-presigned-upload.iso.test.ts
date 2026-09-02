import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  presignBucketName,
  presignSimulation,
} from "../../../../test/s3/presign-simulation.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

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
  const objectUrl = (key: string): string =>
    `http://${presignBucketName}.s3.eu-west-2.sim-aws.localhost/${key}`;

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
    assertResponseStatus(response, 400, await describeResponse(response));
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
    assertResponseStatus(response, 200, await describeResponse(response));
    const stored = await simAws
      .s3()
      .getSimBucketByName(presignBucketName)
      ?.getObject("empty.txt");
    assertIdentical(stored?.body.length, 0);
  });

  it("keeps every system metadata header the upload was sent with", async () => {
    // Given a presigned upload URL for a file a static site serves
    const { client, http, userArn } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: presignBucketName, Key: "app.js" }),
      { expiresIn: 900 },
    );

    // When it is uploaded with the headers a site deployment sets
    await http.fetch(url, {
      method: "PUT",
      body: "compressed bytes",
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-disposition": 'inline; filename="app.js"',
        "content-encoding": "br",
        "content-language": "en-GB",
        "content-type": "text/javascript",
        expires: "Sat, 02 Jan 2027 03:04:05 GMT",
      },
    });

    // Then a later read is served every one of them, so a browser is told the
    // bytes are brotli and how long to keep them
    const response = await http.fetch(objectUrl("app.js"), {
      headers: { "x-sim-aws-caller": userArn },
    });
    assertIdentical(
      response.headers.get("cache-control"),
      "public, max-age=31536000, immutable",
    );
    assertIdentical(
      response.headers.get("content-disposition"),
      'inline; filename="app.js"',
    );
    assertIdentical(response.headers.get("content-encoding"), "br");
    assertIdentical(response.headers.get("content-language"), "en-GB");
    assertIdentical(
      response.headers.get("expires"),
      "Sat, 02 Jan 2027 03:04:05 GMT",
    );
  });

  it("keeps the user metadata the upload attached to the Object", async () => {
    // Given a presigned upload URL
    const { client, http, simAws } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: presignBucketName, Key: "invoice.pdf" }),
      { expiresIn: 900 },
    );

    // When the upload attaches metadata of the caller's own
    await http.fetch(url, {
      method: "PUT",
      body: "invoice bytes",
      headers: {
        "x-amz-meta-customer-id": "cust-4192",
        "x-amz-meta-uploaded-by": "billing-portal",
      },
    });

    // Then a read describes the Object with it, under the keys a
    // PutObjectCommand would have stored it under
    const stored = await simAws.s3().getObject(
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: "invoice.pdf",
      }),
    );
    assertDefined(stored.Metadata, "the stored user metadata");
    assertIdentical(stored.Metadata["customer-id"], "cust-4192");
    assertIdentical(stored.Metadata["uploaded-by"], "billing-portal");
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
    const response = await http.fetch(objectUrl("report.csv"), {
      headers: { "x-sim-aws-caller": userArn },
    });
    assertIdentical(response.headers.get("content-type"), "text/csv");
  });
});
