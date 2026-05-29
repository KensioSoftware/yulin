import type { CloudFrontRequest } from "../typings/cloudfront-functions.js";
import { StaticFactory } from "@kensio/part-factory";

/**
 * Makes instances of the CloudFrontRequest object structure.
 */
export const cloudFrontRequestFactory = new StaticFactory<CloudFrontRequest>({
  cookies: {
    sessionId: {
      value: "test-session-id",
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
      value: "Mozilla/5.0",
    },
  },
  method: "GET",
  querystring: {
    page: {
      value: "1",
    },
  },
  uri: "/cloudfront/",
});
