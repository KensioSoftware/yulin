import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  presignBucketName,
  presignObjectBody,
  presignObjectKey,
  presignSimulation,
} from "../../../../test/s3/presign-simulation.js";
import { SimS3Object, SimS3ObjectMetadata } from "../object/s3-object.js";

const objectUrl = `http://${presignBucketName}.s3.eu-west-2.sim-aws.localhost/${presignObjectKey}`;

describe("The simulated S3 REST endpoint", () => {
  it("refuses an unsigned request as anonymous", async () => {
    // Given no signature and no caller header
    const { http } = await presignSimulation();

    // When an Object is requested over the REST endpoint
    const response = await http.fetch(objectUrl);

    // Then the request is anonymous, and anonymous holds nothing: the REST
    // endpoint is the API, not the public website endpoint
    assertResponseStatus(response, 403, await describeResponse(response));
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
    assertResponseStatus(response, 403, await describeResponse(response));
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
    assertResponseStatus(response, 404, await describeResponse(response));
    assertIdentical(response.headers.get("content-type"), "application/xml");
    expect(await response.text()).toMatch(/<Code>NoSuchKey<\/Code>/);
  });

  it("refuses a missing Object to a signer that may not list the Bucket", async () => {
    // Given a presigned URL from a user allowed to read Objects and nothing
    // else, for an Object that is not there
    const { client, http } = await presignSimulation({
      allowsBucketListing: false,
    });
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: presignBucketName, Key: "missing.pdf" }),
      { expiresIn: 900 },
    );

    // When it is fetched
    const response = await http.fetch(url);

    // Then the endpoint refuses rather than admitting the key is absent, which
    // is what a deployed client holding the same permissions is answered
    assertResponseStatus(response, 403, await describeResponse(response));
    expect(await response.text()).toMatch(/<Code>AccessDenied<\/Code>/);
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
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(
      response.headers.get("content-length"),
      String(presignObjectBody.length),
    );
    assertIdentical(await response.text(), "");
  });

  it("serves the entity tag and write time of an Object it reads", async () => {
    // Given a presigned URL for an Object
    const { client, http } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );

    // When it is read over the REST endpoint
    const response = await http.fetch(url);

    // Then the response carries the entity tag and last-modified time real S3
    // sends, which is what lets a client revalidate rather than re-download
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(
      response.headers.get("etag"),
      `"${createHash("md5").update(presignObjectBody).digest("hex")}"`,
    );
    assertNonNullable(response.headers.get("last-modified"));
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
    assertResponseStatus(response, 204, await describeResponse(response));
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
    assertResponseStatus(readBack, 404, await describeResponse(readBack));
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
    assertResponseStatus(response, 403, await describeResponse(response));
    expect(await response.text()).toMatch(/s3:DeleteObject/);
  });

  it("refuses a method it does not simulate", async () => {
    // Given a POST, which simulated S3 has no REST command for
    const { http } = await presignSimulation();

    // When it reaches the REST endpoint
    const response = await http.fetch(objectUrl, { method: "POST" });

    // Then the gap is reported rather than answered with something plausible
    assertResponseStatus(response, 501, await describeResponse(response));
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
    assertResponseStatus(response, 501, await describeResponse(response));
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
    assertResponseStatus(response, 404, await describeResponse(response));
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
    assertResponseStatus(response, 400, await describeResponse(response));
    expect(await response.text()).toMatch(/not valid percent-encoding/);
  });

  it("refuses a path style request naming no Bucket at all", async () => {
    // Given a request to the Region endpoint itself
    const { http } = await presignSimulation();

    // When it arrives with nothing in the path
    const response = await http.fetch("http://s3.eu-west-2.sim-aws.localhost/");

    // Then there is no Bucket to serve from
    assertResponseStatus(response, 400, await describeResponse(response));
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

  it("serves the system metadata an Object was stored with", async () => {
    // Given an Object stored as brotli with a cache directive of its own, as a
    // CDK BucketDeployment stores one
    const { simAws, client, http } = await presignSimulation();
    const bucket = simAws.s3().getSimBucketByName(presignBucketName);

    assertNonNullable(bucket);

    await bucket.putObject(
      new SimS3Object({
        key: "data/standard.keys",
        body: Buffer.from("compressed"),
        metadata: new SimS3ObjectMetadata({
          "content-type": "text/plain",
          "content-encoding": "br",
          "cache-control": "public, max-age=60",
        }),
      }),
    );

    // When it is read back over the REST endpoint
    const response = await http.fetch(
      await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: presignBucketName,
          Key: "data/standard.keys",
        }),
        { expiresIn: 900 },
      ),
    );

    // Then the headers S3 was given come back with the bytes, so a client can
    // decode what it is sent
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(response.headers.get("content-encoding"), "br");
    assertIdentical(response.headers.get("content-type"), "text/plain");
    assertIdentical(
      response.headers.get("cache-control"),
      "public, max-age=60",
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
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), presignObjectBody);
  });
});
