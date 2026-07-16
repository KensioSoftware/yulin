import {
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3ServiceController } from "./sim-s3-controller.js";

describe("Simulated S3 local HTTP controller", () => {
  const simS3ServiceController = new SimS3ServiceController();

  it("responds HTTP 400 for missing S3 Bucket name", async () => {
    const res = await simS3ServiceController.handleRequest(
      {
        service: "s3",
        resourceName: "",
        regionName: "eu-west-2",
      },
      new Request("http://s3-website.eu-west-2.localhost/index.html", {
        method: "GET",
      }),
    );

    assertResponseStatus(res, 400, await describeResponse(res));
    assertStringIncludes(await res.text(), "Missing S3 Bucket name");
  });

  it("responds HTTP 400 for missing S3 Bucket region", async () => {
    const res = await simS3ServiceController.handleRequest(
      {
        service: "s3",
        resourceName: "foo-site",
      },
      new Request("http://foo-site.s3-website.localhost/index.html", {
        method: "GET",
      }),
    );

    assertResponseStatus(res, 400, await describeResponse(res));
    assertStringIncludes(await res.text(), "Missing S3 Bucket region");
  });
});
