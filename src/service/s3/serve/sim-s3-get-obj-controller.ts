import type { SimS3Bucket } from "../bucket/sim-s3-bucket.js";
import type { SimS3Object } from "../object/s3-object.js";

/**
 * Serves a simulated S3 Object over HTTP.
 */
export class SimS3GetObjectController {
  /**
   * Handle a GET request for an S3 Object via simulated S3.
   */
  async handleRequest(
    bucket: SimS3Bucket,
    objectKey: string,
    request: Request,
  ): Promise<Response> {
    const website = bucket.getWebsite();

    if (!website.websiteEnabled()) {
      return new Response(
        `Static website hosting is not enabled for bucket ${bucket.bucketName}\n`,
        {
          status: 403,
          headers: {
            "content-type": "text/plain; charset=utf-8",
          },
        },
      );
    }

    if (website.redirectsAllRequests()) {
      return website.redirectForRequestResponse(
        request,
        new Response(undefined),
      );
    }

    const response = await this.websiteResponse(bucket, objectKey, request);

    return website.redirectForRequestResponse(request, response);
  }

  private async websiteResponse(
    bucket: SimS3Bucket,
    objectKey: string,
    request: Request,
  ): Promise<Response> {
    const website = bucket.getWebsite();
    const websiteObjectKey = website.objectKeyForRequest(objectKey);
    const object = await bucket.getObject(websiteObjectKey);

    if (object !== undefined) {
      return this.foundObjectResponse(object, request);
    }

    const folderIndexDocumentKey =
      website.folderIndexDocumentKeyForRequest(objectKey);

    if (folderIndexDocumentKey !== undefined) {
      const folderIndexDocumentObject = await bucket.getObject(
        folderIndexDocumentKey,
      );

      if (folderIndexDocumentObject !== undefined) {
        return website.trailingSlashRedirect(request);
      }
    }

    const errorDocumentKey = website.errorDocumentKey();

    if (errorDocumentKey !== undefined) {
      const errorDocumentObject = await bucket.getObject(errorDocumentKey);

      if (errorDocumentObject !== undefined) {
        return this.foundObjectResponse(errorDocumentObject, request, 404);
      }
    }

    return this.notFoundResponse(bucket, websiteObjectKey);
  }

  private foundObjectResponse(
    object: SimS3Object,
    request: Request,
    status = 200,
  ): Response {
    const contentType = object.metadata.values["content-type"];

    const headers = {
      "content-length": String(object.body.length),
      ...(contentType === undefined ? {} : { "content-type": contentType }),
    };

    if (request.method === "HEAD") {
      return new Response(undefined, {
        status,
        headers,
      });
    }

    return new Response(object.body, {
      status,
      headers,
    });
  }

  private notFoundResponse(bucket: SimS3Bucket, objectKey: string): Response {
    return new Response(
      `Object ${objectKey} not found in bucket ${bucket.bucketName}`,
      {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      },
    );
  }
}
