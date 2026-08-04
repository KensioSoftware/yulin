/**
 * A client of the image pipeline, doing what an application's own client does:
 * sign in, ask for an upload, put the bytes somewhere, and come back later to
 * see what became of them.
 *
 * Requests go through `SimAwsHttp`, so they are ordinary HTTP requests handled
 * by the simulated services in this process, with no port and no socket.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { SimAwsHttp } from "../../src/serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../src/serve/http/url/sim-aws-local-url.js";
import { mediaBucketName } from "./media-pipeline-names.js";

/**
 * What `POST /uploads` answers with.
 */
export interface RequestedUpload {
  readonly uploadId: string;
  readonly uploadKey: string;
}

/**
 * One rendition, as the API reports it.
 */
export interface ReportedRendition {
  readonly width: number;
  readonly url: string;
}

/**
 * What `GET /uploads/{uploadId}` answers with.
 */
export interface ReportedUpload {
  readonly status: string;
  readonly published: boolean;
  readonly renditions: readonly ReportedRendition[];
}

interface MediaPipelineRequest {
  readonly method: string;
  readonly path: string;
  readonly body?: Record<string, number>;
  readonly authorized?: boolean;
}

/**
 * What a client needs before it can call the pipeline.
 */
export interface MediaPipelineClientProperties {
  readonly simAws: SimAws;
  readonly apiEndpoint: string;
  readonly accessToken: string;
}

/**
 * A signed-in client of the pipeline's API.
 */
export class MediaPipelineClient {
  private readonly simAws: SimAws;
  private readonly apiEndpoint: string;
  private readonly http: SimAwsHttp;
  private readonly accessToken: string;

  constructor(properties: MediaPipelineClientProperties) {
    this.simAws = properties.simAws;
    this.apiEndpoint = properties.apiEndpoint;
    this.http = new SimAwsHttp({ simAws: properties.simAws });
    this.accessToken = properties.accessToken;
  }

  /**
   * Ask for somewhere to put an upload.
   */
  async requestUpload(): Promise<RequestedUpload> {
    const response = await this.request({ method: "POST", path: "/uploads" });

    return (await response.json()) as RequestedUpload;
  }

  /**
   * Put the bytes where the API said to put them.
   *
   * A real client would do this with a presigned URL rather than as itself,
   * but what the pipeline reacts to is the Object appearing either way.
   */
  async putBytes(uploadKey: string, bytes: Uint8Array): Promise<void> {
    await this.simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: mediaBucketName,
        Key: uploadKey,
        Body: bytes,
      }),
    );
  }

  /**
   * Ask what became of an upload.
   */
  async getUpload(uploadId: string): Promise<ReportedUpload> {
    const response = await this.request({
      method: "GET",
      path: `/uploads/${uploadId}`,
    });

    return (await response.json()) as ReportedUpload;
  }

  /**
   * Choose one rendition to publish.
   */
  async publish(uploadId: string, width: number): Promise<Response> {
    return this.request({
      method: "POST",
      path: `/uploads/${uploadId}/published`,
      body: { width },
    });
  }

  /**
   * Fetch a delivery URL the API handed out, as a browser loading the image
   * would.
   */
  async fetchDelivered(url: string): Promise<Response> {
    return this.http.fetch(new SimAwsLocalUrl({ input: url }).toString());
  }

  /**
   * Make a request to the pipeline's API, bearing this client's token unless
   * the caller is asking what happens without one.
   */
  async request(properties: MediaPipelineRequest): Promise<Response> {
    const { method, path, body, authorized = true } = properties;

    return this.http.fetch(
      new SimAwsLocalUrl({
        input: `${this.apiEndpoint}${path}`,
      }).toString(),
      {
        method,
        headers: {
          ...(authorized && { authorization: `Bearer ${this.accessToken}` }),
          ...(body !== undefined && { "content-type": "application/json" }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      },
    );
  }
}
