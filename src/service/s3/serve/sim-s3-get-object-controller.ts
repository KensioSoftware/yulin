import type { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import type { SimS3Bucket } from "../bucket/sim-s3-bucket.js";
import type { SimS3WebsiteRoute } from "./sim-s3-route.js";
import { SimS3WebsiteObjectLoader } from "./website/sim-s3-website-object-loader.js";
import type { SimS3WebsiteObject } from "./website/sim-s3-website-object.js";
import { SimS3WebsiteResponses } from "./website/sim-s3-website-responses.js";

interface SimS3GetObjectControllerProperties {
  readonly simAws: SimAws;
}

/**
 * Serves a simulated S3 Object over the static website endpoint.
 *
 * Real S3 serves a website endpoint only what the Bucket policy makes readable,
 * answering 403 for an Object that is not publicly readable. Objects are
 * therefore read through the ordinary GetObject command, so a Bucket with no
 * policy serves nothing to the browser that asks for a page.
 *
 * The reading is done as whoever the boundary resolved rather than always as
 * anonymous, which is a deliberate divergence: a real website endpoint
 * authenticates nothing, so an identity policy could never reach it there. It
 * keeps the simulator's served services consistent with each other, at the cost
 * of being looser than S3 for a request that names a principal.
 */
export class SimS3GetObjectController {
  private readonly simAws: SimAws;
  private readonly responses = new SimS3WebsiteResponses();

  constructor(properties: SimS3GetObjectControllerProperties) {
    this.simAws = properties.simAws;
  }

  /**
   * Handle a GET or HEAD request for an S3 Object via the website endpoint.
   */
  async handleRequest(
    route: SimS3WebsiteRoute,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    const { bucket } = route;
    const website = bucket.getWebsite();
    const { request } = serviceRequest;

    if (!website.websiteEnabled()) {
      return this.responses.websiteNotEnabled(bucket.bucketName);
    }

    if (website.redirectsAllRequests()) {
      return website.redirectForRequestResponse(
        request,
        new Response(undefined),
      );
    }

    const loader = SimS3WebsiteObjectLoader.forRoute(
      this.simAws,
      route,
      serviceRequest,
    );

    return website.redirectForRequestResponse(
      request,
      await this.websiteResponse(route, request, loader),
    );
  }

  private async websiteResponse(
    route: SimS3WebsiteRoute,
    request: Request,
    loader: SimS3WebsiteObjectLoader,
  ): Promise<Response> {
    const { bucket, objectKey } = route;
    const websiteObjectKey = bucket.getWebsite().objectKeyForRequest(objectKey);
    const object = await this.loadRequested(loader, websiteObjectKey);

    if (object instanceof SimIamAccessDenied) {
      return await this.deniedResponse(bucket, request, loader);
    }

    if (object !== undefined) {
      return this.responses.foundObject(object, request);
    }

    return await this.missingResponse(route, request, loader, websiteObjectKey);
  }

  /**
   * Answer a request for an Object the Bucket does not hold, which is either a
   * folder needing a trailing slash, the error document, or a plain 404.
   */
  private async missingResponse(
    route: SimS3WebsiteRoute,
    request: Request,
    loader: SimS3WebsiteObjectLoader,
    websiteObjectKey: string,
  ): Promise<Response> {
    const { bucket, objectKey } = route;
    const website = bucket.getWebsite();
    const folderIndexDocumentKey =
      website.folderIndexDocumentKeyForRequest(objectKey);

    if (
      folderIndexDocumentKey !== undefined &&
      (await loader.loadIfPermitted(folderIndexDocumentKey)) !== undefined
    ) {
      return website.trailingSlashRedirect(request);
    }

    const errorDocumentObject = await this.errorDocument(bucket, loader);

    if (errorDocumentObject !== undefined) {
      return this.responses.foundObject(errorDocumentObject, request, 404);
    }

    return this.responses.notFound(bucket.bucketName, websiteObjectKey);
  }

  /**
   * Load the Object the visitor asked for, reporting a denial as a value so
   * the caller can answer 403 rather than falling through to the 404 path.
   */
  private async loadRequested(
    loader: SimS3WebsiteObjectLoader,
    objectKey: string,
  ): Promise<SimS3WebsiteObject | SimIamAccessDenied | undefined> {
    try {
      return await loader.load(objectKey);
    } catch (error) {
      if (error instanceof SimIamAccessDenied) {
        return error;
      }

      throw error;
    }
  }

  /**
   * Real S3 serves the custom error document for the whole 4XX class, so a
   * denied request gets it too, provided the visitor may read it.
   */
  private async deniedResponse(
    bucket: SimS3Bucket,
    request: Request,
    loader: SimS3WebsiteObjectLoader,
  ): Promise<Response> {
    const errorDocumentObject = await this.errorDocument(bucket, loader);

    if (errorDocumentObject !== undefined) {
      return this.responses.foundObject(errorDocumentObject, request, 403);
    }

    return this.responses.accessDenied(bucket.bucketName);
  }

  private async errorDocument(
    bucket: SimS3Bucket,
    loader: SimS3WebsiteObjectLoader,
  ): Promise<SimS3WebsiteObject | undefined> {
    const errorDocumentKey = bucket.getWebsite().errorDocumentKey();

    if (errorDocumentKey === undefined) {
      return undefined;
    }

    return await loader.loadIfPermitted(errorDocumentKey);
  }
}
