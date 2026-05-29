import type {
  CloudFrontEvent,
  CloudFrontRequest,
} from "../typings/cloudfront-functions.js";
import { DynamicFactory, VariantFactory } from "@kensio/part-factory";
import { faker } from "@faker-js/faker";

/**
 * Makes instances of the CloudFrontEvent object structure.
 */
const cloudFrontEventFactory = new DynamicFactory<CloudFrontEvent>(() => ({
  context: {
    eventType: faker.helpers.arrayElement([
      "viewer-request",
      "viewer-response",
    ]),
    requestId: faker.string.uuid(),
  },
  request: cloudFrontRequestFactory.make(),
  viewer: { ip: faker.internet.ipv4() },
}));

/**
 * Makes instances of the viewer-request CloudFrontEvent objects.
 */
export const cloudFrontViewerRequestEventFactory =
  new VariantFactory<CloudFrontEvent>(cloudFrontEventFactory, {
    context: { eventType: "viewer-request" },
  });

/**
 * Makes instances of the CloudFrontRequest object structure.
 */
const cloudFrontRequestFactory = new DynamicFactory<CloudFrontRequest>(() => ({
  cookies: {
    sessionId: {
      value: faker.string.uuid(),
    },
  },
  headers: {
    accept: {
      value: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
