import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import {
  presignBucketName,
  presignClient,
  presignObjectBody,
  presignObjectKey,
  presignSimulation,
  type PresignSimulation,
} from "../../../../test/s3/presign-simulation.js";
import { SimAwsLocalServer } from "../../../serve/index.js";
import type { S3Client } from "@aws-sdk/client-s3";

/**
 * The presigned URL path over a real localhost server, as an application would
 * use it: an ordinary `fetch` of a URL, with no simulator involved at the point
 * of use.
 */
describe("Presigned simulated S3 URLs over a local server", () => {
  let simulation: PresignSimulation;
  let srv: SimAwsLocalServer;
  let client: S3Client;

  beforeAll(async () => {
    simulation = await presignSimulation();
    srv = new SimAwsLocalServer({ simAws: simulation.simAws });
    await srv.listen();

    // The client signs for the local endpoint, port and all: a presigned URL
    // covers its own host, so the port has to be known before signing rather
    // than added to the URL afterwards.
    client = presignClient({
      endpoint: srv.localUrl(simulation.simAws.s3().getServiceUrl()),
      credentials: simulation.credentials,
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  it("downloads an Object through a presigned URL", async () => {
    // Given a URL presigned for the running local server
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );

    // When it is fetched over real HTTP
    const response = await fetch(url);

    // Then the Object comes back
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), presignObjectBody);
  });

  it("downloads through a URL signed for an endpoint URL", async () => {
    // Given a URL presigned by a client pointed at the local server as an
    // endpoint URL, the form --endpoint-url and AWS_ENDPOINT_URL take
    const url = await getSignedUrl(
      presignClient({
        endpoint: `http://localhost:${srv.port}`,
        credentials: simulation.credentials,
        forcePathStyle: true,
      }),
      new GetObjectCommand({
        Bucket: presignBucketName,
        Key: presignObjectKey,
      }),
      { expiresIn: 900 },
    );

    // When it is fetched over real HTTP
    const response = await fetch(url);

    // Then the Object comes back, with no hostname naming the service
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), presignObjectBody);
  });

  it("uploads an Object through a presigned URL", async () => {
    // Given a presigned upload URL
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: presignBucketName,
        Key: "uploads/from-http.txt",
      }),
      { expiresIn: 900 },
    );

    // When something is uploaded to it over real HTTP
    const response = await fetch(url, {
      method: "PUT",
      body: "uploaded over the wire",
    });

    // Then it is stored in the simulated Bucket
    assertResponseStatus(response, 200, await describeResponse(response));
    const stored = await simulation.simAws
      .s3()
      .getSimBucketByName(presignBucketName)
      ?.getObject("uploads/from-http.txt");
    assertIdentical(stored?.body.toString(), "uploaded over the wire");
  });
});
