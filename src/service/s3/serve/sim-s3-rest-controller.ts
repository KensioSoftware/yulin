import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import type { SimS3RestObjectRoute } from "./sim-s3-route.js";
import { SimS3RestErrorResponse } from "./sim-s3-rest-error-response.js";
import { SimS3RestObjectReader } from "./sim-s3-rest-object-reader.js";
import { SimS3UploadChecksum } from "./sim-s3-upload-checksum.js";
import type { SimS3 } from "../sim-s3.js";

interface SimS3RestControllerProperties {
  readonly simAws: SimAws;
}

/**
 * Serves Object requests that arrived at the simulated S3 REST endpoint.
 *
 * Everything goes through the ordinary command handlers rather than reaching
 * into Bucket storage, so an HTTP request is authorized exactly as the same
 * operation is when an SDK client makes it in process. That is the point of
 * this endpoint: a presigned URL grants no more than the principal who signed
 * it has, and it is IAM that decides what that is.
 */
export class SimS3RestController {
  private readonly simAws: SimAws;
  private readonly reader = new SimS3RestObjectReader();

  constructor(properties: SimS3RestControllerProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Serve a REST Object request as the principal the boundary resolved.
   */
  async handleRequest(
    route: SimS3RestObjectRoute,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    const errors = new SimS3RestErrorResponse({
      bucketName: route.bucket.bucketName,
      objectKey: route.objectKey,
    });

    try {
      return await this.serve(route, serviceRequest);
    } catch (error) {
      return errors.build(error);
    }
  }

  private async serve(
    route: SimS3RestObjectRoute,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    if (serviceRequest.request.method === "PUT") {
      return await this.putObject(route, serviceRequest);
    }

    if (serviceRequest.request.method === "DELETE") {
      return await this.deleteObject(route, serviceRequest);
    }

    return await this.reader.read(this.s3For(route), route, serviceRequest);
  }

  /**
   * Remove an Object.
   *
   * Real S3 answers a deletion with `204 No Content` whether or not the Object
   * was there, so a client cannot tell the two apart.
   */
  private async deleteObject(
    route: SimS3RestObjectRoute,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    await this.s3For(route).deleteObject(
      { input: { Bucket: route.bucket.bucketName, Key: route.objectKey } },
      { caller: serviceRequest.caller.toCaller() },
    );

    return new Response(undefined, { status: 204 });
  }

  /**
   * Store an uploaded Object.
   *
   * The stated checksum is checked before anything is stored, as real S3 does,
   * so an upload that would be refused there is refused here rather than
   * quietly landing in the Bucket.
   */
  private async putObject(
    route: SimS3RestObjectRoute,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    const { request, body } = serviceRequest;

    SimS3UploadChecksum.stated(new URL(request.url), request.headers)?.check(
      body,
    );

    const contentType = request.headers.get("content-type") ?? undefined;

    await this.s3For(route).putObject(
      {
        input: {
          Bucket: route.bucket.bucketName,
          Key: route.objectKey,
          Body: body ?? new Uint8Array(),
          ...(contentType !== undefined && { ContentType: contentType }),
        },
      },
      { caller: serviceRequest.caller.toCaller() },
    );

    return new Response(undefined, { status: 200 });
  }

  private s3For(route: SimS3RestObjectRoute): SimS3 {
    return this.simAws
      .accountRegionScope(
        route.bucketScope.accountId,
        route.bucketScope.regionName,
      )
      .s3();
  }
}
