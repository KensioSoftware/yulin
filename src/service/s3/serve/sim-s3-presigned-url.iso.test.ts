import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  presignBucketName,
  presignObjectBody,
  presignObjectKey,
  presignSimulation,
} from "../../../../test/s3/presign-simulation.js";

describe("Presigned simulated S3 URLs", () => {
  it("serves an Object through a URL the real AWS presigner signed", async () => {
    // Given a presigned GET URL built by @aws-sdk/s3-request-presigner
    const { client, http } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );

    // When it is fetched, with nothing else establishing who is asking
    const response = await http.fetch(url);

    // Then simulated S3 serves the Object, so the signature alone was enough
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), presignObjectBody);
    assertIdentical(response.headers.get("content-type"), "application/pdf");
  });

  it("attributes the request to the principal that signed the URL", async () => {
    // Given a presigned GET URL
    const { client, http, userArn } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );

    // When it is fetched
    const response = await http.fetch(url);

    // Then the simulator reports the signing user as the caller, because a
    // presigned URL grants exactly what its signer holds
    assertIdentical(response.headers.get("x-sim-aws-caller"), userArn);
    assertIdentical(response.headers.get("x-sim-aws-auth"), "sigv4");
  });

  it("stores an upload made through a presigned PUT URL", async () => {
    // Given a presigned PUT URL
    const { client, http, simAws } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: presignBucketName,
        Key: "uploads/notes.txt",
      }),
      { expiresIn: 900 },
    );

    // When a body is uploaded to it
    const response = await http.fetch(url, {
      method: "PUT",
      body: "uploaded through a link",
      headers: { "content-type": "text/plain" },
    });

    // Then the Object is in the simulated Bucket
    assertIdentical(response.status, 200);
    const stored = await simAws
      .s3()
      .getSimBucketByName(presignBucketName)
      ?.getObject("uploads/notes.txt");
    assertIdentical(stored?.body.toString(), "uploaded through a link");
  });

  it("refuses a URL whose signature was tampered with", async () => {
    // Given a presigned URL for one Object, edited to name another
    const { client, http } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );
    const tampered = url.replace(presignObjectKey, "q3/secret.pdf");

    // When it is fetched
    const response = await http.fetch(tampered);

    // Then it is refused: the key is signed, so it cannot be swapped
    assertIdentical(response.status, 403);
    expect(response.headers.get("x-sim-aws-error")).toBe(
      "SignatureDoesNotMatch",
    );
  });

  it("refuses a URL after simulated time passes its expiry", async () => {
    // Given a presigned URL good for fifteen minutes
    const { client, http, simAws } = await presignSimulation();
    simAws.clock().freeze();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );

    // When simulated time moves past that window
    await simAws.clock().advanceBy({ minutes: 20 });
    const response = await http.fetch(url);

    // Then the URL has expired, in simulated time rather than real time
    assertIdentical(response.status, 403);
    expect(response.headers.get("x-sim-aws-error")).toBe("AccessDenied");
    expect(response.headers.get("x-sim-aws-error-detail")).toMatch(
      /Request has expired/,
    );
  });

  it("keeps a URL usable while the simulated clock is frozen", async () => {
    // Given a frozen clock and a URL signed for one second
    const { client, http, simAws } = await presignSimulation();
    simAws.clock().freeze();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 1 },
    );

    // When it is fetched after more than a second of real time has passed, so
    // a window judged against the real clock would have closed
    await new Promise((resolve) => {
      setTimeout(resolve, 1100);
    });
    const response = await http.fetch(url);

    // Then it still works, because expiry is judged in simulated time
    assertIdentical(response.status, 200);
  });
});
