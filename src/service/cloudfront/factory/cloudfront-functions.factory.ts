import { DynamicFactory } from "@kensio/part-factory";
import { faker } from "@faker-js/faker";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";

/**
 * Makes instances of the viewer-request CloudFrontEvent objects.
 */
export const cloudFrontViewerRequestEventFactory =
  new DynamicFactory<CloudFrontFunction.ViewerRequestEvent>(() => ({
    context: {
      eventType: "viewer-request",
      requestId: faker.string.uuid(),
    },
    request: cloudFrontRequestFactory.make(),
    viewer: { ip: faker.internet.ipv4() },
  }));

/**
 * Makes instances of the viewer-response CloudFrontEvent objects.
 */
export const cloudFrontViewerResponseEventFactory =
  new DynamicFactory<CloudFrontFunction.ViewerResponseEvent>(() => ({
    context: {
      eventType: "viewer-response",
      requestId: faker.string.uuid(),
    },
    request: cloudFrontRequestFactory.make(),
    response: cloudFrontResponseFactory.make(),
    viewer: { ip: faker.internet.ipv4() },
  }));

/**
 * Makes instances of the CloudFrontRequest object structure.
 */
export const cloudFrontRequestFactory =
  new DynamicFactory<CloudFrontFunction.Request>(() => ({
    cookies: {
      sessionId: {
        value: faker.string.uuid(),
      },
    },
    headers: {
      accept: {
        value:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      "accept-language": {
        value: "en-GB,en;q=0.9",
      },
      host: {
        value: "yulin.test",
      },
      "user-agent": {
        value: faker.internet.userAgent(),
      },
    },
    method: faker.internet.httpMethod(),
    querystring: {
      page: {
        value: "1",
      },
    },
    uri: "/cloudfront/",
  }));

/**
 * Makes instances of the CloudFrontResponse object structure.
 */
export const cloudFrontResponseFactory =
  new DynamicFactory<CloudFrontFunction.Response>(() => ({
    statusCode: faker.internet.httpStatusCode(),
    headers: {},
  }));
