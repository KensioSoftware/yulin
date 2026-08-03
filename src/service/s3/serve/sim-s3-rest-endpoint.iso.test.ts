import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  presignBucketName,
  presignObjectBody,
  presignObjectKey,
  presignSimulation,
} from "../../../../test/s3/presign-simulation.js";

const objectUrl = `http://${presignBucketName}.s3.eu-west-2.sim-aws.localhost/${presignObjectKey}`;

describe("The simulated S3 REST endpoint", () => {
  it("refuses an unsigned request as anonymous", async () => {
    // Given no signature and no caller header
    const { http } = await presignSimulation();

    // When an Object is requested over the REST endpoint
    const response = await http.fetch(objectUrl);

    // Then the request is anonymous, and anonymous holds nothing: the REST
    // endpoint is the API, not the public website endpoint
    assertIdentical(response.status, 403);
    expect(await response.text()).toMatch(/<Code>AccessDenied<\/Code>/);
  });

  it("refuses a presigned URL for an action its signer cannot perform", async () => {
    // Given a user allowed to read Objects but not to write them
    const { client, http } = await presignSimulation({
      allowedActions: ["s3:GetObject"],
    });
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: presignBucketName, Key: "denied.txt" }),
      { expiresIn: 900 },
    );

    // When they presign an upload and it is used
    const response = await http.fetch(url, { method: "PUT", body: "nope" });

    // Then IAM refuses it: presigning grants no more than the signer holds
    assertIdentical(response.status, 403);
    expect(await response.text()).toMatch(/s3:PutObject/);
  });

  it("answers a missing Object with the S3 error document", async () => {
    // Given a presigned URL for an Object that is not there
    const { client, http } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: presignBucketName, Key: "missing.pdf" }),
      { expiresIn: 900 },
    );

    // When it is fetched
    const response = await http.fetch(url);

    // Then the XML document the AWS SDK reads its error code out of comes back
    assertIdentical(response.status, 404);
    assertIdentical(response.headers.get("content-type"), "application/xml");
    expect(await response.text()).toMatch(/<Code>NoSuchKey<\/Code>/);
  });

  it("serves a HEAD request without a body", async () => {
    // Given a URL presigned for HEAD, since the method is signed and a URL
    // presigned for GET cannot be used with another
    const { client, http } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new HeadObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );

    // When the Object is asked about rather than for
    const response = await http.fetch(url, { method: "HEAD" });

    // Then its size comes back with no body, as real S3 answers a HEAD
    assertIdentical(response.status, 200);
    assertIdentical(
      response.headers.get("content-length"),
      String(presignObjectBody.length),
    );
    assertIdentical(await response.text(), "");
  });

  it("deletes an Object over a presigned DELETE", async () => {
    // Given a user allowed to delete Objects, and a URL they presigned
    const { client, http } = await presignSimulation({
      allowedActions: ["s3:GetObject", "s3:DeleteObject"],
    });
    const url = await getSignedUrl(
      client,
      new DeleteObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );

    // When the URL is used
    const response = await http.fetch(url, { method: "DELETE" });

    // Then S3 answers with no content, and the Object has gone
    assertIdentical(response.status, 204);
    assertIdentical(await response.text(), "");

    const readBack = await http.fetch(
      await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: presignBucketName,
          Key: presignObjectKey,
        }),
        { expiresIn: 900 },
      ),
    );
    assertIdentical(readBack.status, 404);
  });

  it("refuses a DELETE its signer cannot perform", async () => {
    // Given a user allowed to read Objects but not to delete them
    const { client, http } = await presignSimulation({
      allowedActions: ["s3:GetObject"],
    });
    const url = await getSignedUrl(
      client,
      new DeleteObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );

    // When they presign a deletion and it is used
    const response = await http.fetch(url, { method: "DELETE" });

    // Then IAM refuses it, and the Object is still there
    assertIdentical(response.status, 403);
    expect(await response.text()).toMatch(/s3:DeleteObject/);
  });

  it("refuses a method it does not simulate", async () => {
    // Given a POST, which simulated S3 has no REST command for
    const { http } = await presignSimulation();

    // When it reaches the REST endpoint
    const response = await http.fetch(objectUrl, { method: "POST" });

    // Then the gap is reported rather than answered with something plausible
    assertIdentical(response.status, 501);
    expect(await response.text()).toMatch(/does not serve POST/);
  });

  it("refuses a request naming a Bucket and no Object", async () => {
    // Given a request to the Bucket itself
    const { http } = await presignSimulation();

    // When it reaches the REST endpoint
    const response = await http.fetch(
      `http://${presignBucketName}.s3.eu-west-2.sim-aws.localhost/`,
    );

    // Then it is refused: only Object requests are served over HTTP
    assertIdentical(response.status, 501);
    expect(await response.text()).toMatch(/Bucket operations are not served/);
  });

  it("answers a request for a Bucket that does not exist", async () => {
    // Given a hostname naming a Bucket nothing created
    const { http } = await presignSimulation();

    // When it is requested
    const response = await http.fetch(
      "http://absent.s3.eu-west-2.sim-aws.localhost/anything.txt",
    );

    // Then the Bucket is reported missing before anything else is decided
    assertIdentical(response.status, 404);
    expect(await response.text()).toMatch(/absent not found/);
  });

  it("refuses a path it cannot read as an Object key", async () => {
    // Given a path that is not valid percent-encoding
    const { http } = await presignSimulation();

    // When it reaches the REST endpoint
    const response = await http.fetch(
      `http://${presignBucketName}.s3.eu-west-2.sim-aws.localhost/%zz`,
    );

    // Then it is the caller's mistake, not the simulator's
    assertIdentical(response.status, 400);
    expect(await response.text()).toMatch(/not valid percent-encoding/);
  });

  it("refuses a path style request naming no Bucket at all", async () => {
    // Given a request to the Region endpoint itself
    const { http } = await presignSimulation();

    // When it arrives with nothing in the path
    const response = await http.fetch("http://s3.eu-west-2.sim-aws.localhost/");

    // Then there is no Bucket to serve from
    assertIdentical(response.status, 400);
    expect(await response.text()).toMatch(/Missing S3 Bucket name/);
  });

  it("gives the REST endpoint URL for a Bucket", async () => {
    // Given a simulated Bucket
    const { simAws } = await presignSimulation();

    // Then its virtual-hosted style endpoint is the one a presigned URL uses
    assertIdentical(
      simAws.s3().getBucketUrl(presignBucketName).toString(),
      `http://${presignBucketName}.s3.eu-west-2.sim-aws.localhost/`,
    );
  });

  it("serves a path style request, as a dotted Bucket name needs", async () => {
    // Given a client addressing the Bucket in the path rather than the
    // hostname, which is what the AWS SDK does for itself when a Bucket name
    // contains dots and cannot be a single host label
    const { client, http } = await presignSimulation({ forcePathStyle: true });
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );

    // When the presigned URL it built is fetched
    const response = await http.fetch(url);

    // Then the Bucket is found in the path, and the Object is served
    expect(new URL(url).hostname).toBe("s3.eu-west-2.sim-aws.localhost");
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), presignObjectBody);
  });
});
