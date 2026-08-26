import {
  assertIdentical,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAws } from "../../aws/sim-aws.js";
import { searchDistributionUrl } from "./sim-cff-search-distribution.fixture.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";

/**
 * A search Function reading a query parameter and sending the viewer somewhere
 * with it. A decoded value goes wrong here.
 */
function searchHandler(event: CloudFrontFunction.ViewerRequestEvent) {
  const term = event.request.querystring["q"];

  if (term !== undefined && !event.request.uri.endsWith("/")) {
    return {
      statusCode: 308,
      statusDescription: "Permanent Redirect",
      headers: {
        location: { value: `${event.request.uri}/?q=${term.value}` },
      },
    };
  }

  return event.request;
}

describe("query string encoding through a sim CloudFront Distribution", () => {
  it("forwards the query the viewer sent to the Origin byte for byte", async () => {
    // Given a search behind a Function passing the request through.
    const simAws = new SimAws();
    const url = await searchDistributionUrl(
      simAws,
      "/liju/search/?q=%E5%AE%B6&page=a%20b",
      searchHandler,
    );

    // When the viewer searches with a percent-encoded term.
    const response = await new SimAwsHttp({ simAws }).fetch(url);

    // Then the Origin is sent the spelling the viewer used.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), '"q=%E5%AE%B6&page=a%20b"');
  });

  it("redirects with the encoded term rather than failing on it", async () => {
    // Given the same search, reached without its trailing slash.
    const simAws = new SimAws();
    const url = await searchDistributionUrl(
      simAws,
      "/liju/search?q=%E5%AE%B6",
      searchHandler,
    );

    // When the viewer searches with a term outside ASCII.
    const response = await new SimAwsHttp({ simAws }).fetch(url, {
      redirect: "manual",
    });

    // Then the Function's Location header carries the term as it arrived.
    assertResponseStatus(response, 308, await describeResponse(response));
    assertIdentical(
      response.headers.get("location"),
      "/liju/search/?q=%E5%AE%B6",
    );
  });
});
