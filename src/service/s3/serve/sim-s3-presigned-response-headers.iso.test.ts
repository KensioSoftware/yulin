import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  presignBucketName,
  presignObjectKey,
  presignSimulation,
} from "../../../../test/s3/presign-simulation.js";

/**
 * A presigned read naming the headers it wants the Object served with.
 *
 * Real S3 lets the URL rather than the Object decide how a browser treats what
 * comes back, which is what turns one stored PDF into a link that opens it and
 * a link that downloads it under a name the application chose. Nothing about
 * the Object changes, so the same Object is served both ways at once.
 */
describe("A presigned read of simulated S3 overriding its response headers", () => {
  it("serves the headers the read named in place of the Object's own", async () => {
    // Given a URL presigned for a stored PDF, asking for it as a download
    const { client, http } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
        ResponseContentType: "application/octet-stream",
        ResponseContentDisposition: 'attachment; filename="q3-report.pdf"',
        ResponseCacheControl: "no-store",
      }),
      { expiresIn: 900 },
    );

    // When it is read
    const response = await http.fetch(url);

    // Then the response carries what the URL named rather than what the
    // Object was written with, so the browser saves the file
    assertIdentical(
      response.headers.get("content-type"),
      "application/octet-stream",
    );
    assertIdentical(
      response.headers.get("content-disposition"),
      'attachment; filename="q3-report.pdf"',
    );
    assertIdentical(response.headers.get("cache-control"), "no-store");
  });

  it("leaves the Object holding the metadata it was written with", async () => {
    // Given the same Object read once through a URL that overrode its type
    const { client, http } = await presignSimulation();
    const overriding = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
        ResponseContentType: "application/octet-stream",
      }),
      { expiresIn: 900 },
    );
    await http.fetch(overriding);

    // When it is read again through a URL that overrides nothing
    const plain = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );
    const response = await http.fetch(plain);

    // Then it is served as the PDF it was stored as: the first read named a
    // header for itself rather than writing one over the Object
    assertIdentical(response.headers.get("content-type"), "application/pdf");
  });

  it("answers a HEAD with the headers that read named", async () => {
    // Given a presigned HEAD asking what a download of the Object would say
    const { client, http } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new HeadObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
        ResponseContentDisposition: 'attachment; filename="q3-report.pdf"',
      }),
      { expiresIn: 900 },
    );

    // When it is sent
    const response = await http.fetch(url, { method: "HEAD" });

    // Then it describes the response the matching GET would send, which is
    // what a client checking a link before following it reads
    assertIdentical(
      response.headers.get("content-disposition"),
      'attachment; filename="q3-report.pdf"',
    );
  });
});
