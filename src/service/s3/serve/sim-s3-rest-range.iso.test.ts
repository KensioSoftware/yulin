import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import type { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import {
  presignBucketName,
  presignObjectBody,
  presignObjectKey,
  presignSimulation,
} from "../../../../test/s3/presign-simulation.js";

interface PresignedRead {
  readonly url: string;
  readonly http: SimAwsHttp;
}

/**
 * Asking the simulated S3 REST endpoint for part of an Object.
 *
 * A client downloading a large Object asks for its pieces at once and writes
 * each response at the offset it asked for, so what matters over HTTP is that
 * a partial response says it is a partial one. A `200` carrying the whole
 * Object where a `206` was expected is written over its neighbours, and the
 * file that lands is neither the right size nor the right content.
 */
describe("A ranged read at the simulated S3 REST endpoint", () => {
  const presignedRead = async (): Promise<PresignedRead> => {
    const { client, http } = await presignSimulation();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );

    return { url, http };
  };

  it("answers with the bytes asked for, as partial content", async () => {
    // Given a presigned URL for an Object of known bytes
    const { url, http } = await presignedRead();

    // When the first nine bytes of it are read
    const response = await http.fetch(url, { headers: { range: "bytes=0-8" } });

    // Then those bytes come back as a partial response, saying which of the
    // Object's bytes they are
    assertIdentical(response.status, 206);
    assertIdentical(await response.text(), presignObjectBody.slice(0, 9));
    assertIdentical(response.headers.get("content-length"), "9");
    assertIdentical(
      response.headers.get("content-range"),
      `bytes 0-8/${presignObjectBody.length}`,
    );
  });

  it("answers a read of the whole Object as it did before", async () => {
    // Given a presigned URL for an Object of known bytes
    const { url, http } = await presignedRead();

    // When it is read without asking for a range
    const response = await http.fetch(url);

    // Then the whole Object comes back, describing no range
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), presignObjectBody);
    assertIdentical(response.headers.get("content-range"), null);
  });

  it("refuses a range of bytes the Object does not hold", async () => {
    // Given a presigned URL for an Object of known bytes
    const { url, http } = await presignedRead();

    // When bytes beyond the end of it are read
    const response = await http.fetch(url, {
      headers: { range: "bytes=900-999" },
    });

    // Then the read is refused, in the XML shape a client reads the code out
    // of, rather than answered with bytes it did not ask for
    assertIdentical(response.status, 416);
    expect(await response.text()).toMatch(/<Code>InvalidRange<\/Code>/);
  });

  it("describes the whole Object however a HEAD asks about it", async () => {
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

    // When the Object is asked about with a range
    const response = await http.fetch(url, {
      method: "HEAD",
      headers: { range: "bytes=0-8" },
    });

    // Then the answer describes the Object rather than the range, which is
    // what HeadObject tells an in-process caller too: simulated S3 does not
    // answer a ranged HEAD as real S3 does
    assertIdentical(response.status, 200);
    assertIdentical(
      response.headers.get("content-length"),
      String(presignObjectBody.length),
    );
    assertIdentical(response.headers.get("content-range"), null);
  });
});
