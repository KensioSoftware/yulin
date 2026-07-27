import {
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3ServiceController } from "./sim-s3-controller.js";
import { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";

describe("Simulated S3 local HTTP controller", () => {
  const simS3ServiceController = new SimS3ServiceController();

  it("responds HTTP 400 for missing S3 Bucket name", async () => {
    const response = await simS3ServiceController.handleRequest(
      new SimAwsServiceRequest({
        target: {
          service: "s3",
          resourceName: "",
          regionName: "eu-west-2",
        },
        request: new Request(
          "http://s3-website.eu-west-2.localhost/index.html",
          {
            method: "GET",
          },
        ),
      }),
    );

    assertResponseStatus(response, 400, await describeResponse(response));
    assertStringIncludes(await response.text(), "Missing S3 Bucket name");
  });

  it("responds HTTP 400 for a path it cannot read as an object key", async () => {
    // Given a website request whose path is not valid percent-encoding
    const response = await simS3ServiceController.handleRequest(
      new SimAwsServiceRequest({
        target: {
          service: "s3",
          resourceName: "foo-site",
          regionName: "eu-west-2",
        },
        request: new Request("http://foo-site.s3-website.localhost/%zz", {
          method: "GET",
        }),
      }),
    );

    // Then the caller is told, rather than the decoding failure escaping as an
    // internal error
    assertResponseStatus(response, 400, await describeResponse(response));
    assertStringIncludes(await response.text(), "not valid percent-encoding");
  });

  it("responds HTTP 400 for missing S3 Bucket region", async () => {
    const response = await simS3ServiceController.handleRequest(
      new SimAwsServiceRequest({
        target: {
          service: "s3",
          resourceName: "foo-site",
        },
        request: new Request(
          "http://foo-site.s3-website.localhost/index.html",
          {
            method: "GET",
          },
        ),
      }),
    );

    assertResponseStatus(response, 400, await describeResponse(response));
    assertStringIncludes(await response.text(), "Missing S3 Bucket region");
  });
});
