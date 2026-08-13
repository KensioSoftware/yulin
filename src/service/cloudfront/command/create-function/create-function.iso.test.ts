import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { CreateFunctionCommand } from "@aws-sdk/client-cloudfront";
import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import { makeCffFunctionCodeInput } from "../../cff/function-code-input/cff-function-code-input.js";
import { assertIdentical, assertInstanceOf } from "@kensio/smartass";
import {
  SimCloudFrontFunction,
  type SimCloudFrontFunctionName,
} from "../../cff/sim-cloudfront-function.js";

describe("CloudFront CreateFunctionCommand", () => {
  it("creates viewer-request CloudFront Function from handler function reference", async () => {
    const simAws = new SimAws();
    const simCloudFront = simAws.cloudFront();

    const cffName = "viewer-request-cff" as SimCloudFrontFunctionName;
    const functionCreation = await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: cffName,
        FunctionConfig: {
          Comment: "Viewer Request CloudFront Function",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(viewerRequestHandlerFunction),
      }),
    );
    assertIdentical(functionCreation.FunctionSummary.Status, "UNPUBLISHED");

    const simCloudFrontFunction =
      simCloudFront.getCloudFrontFunctionByName(cffName);
    assertIdentical(simCloudFrontFunction?.name, cffName);
    assertIdentical(simCloudFrontFunction.status, "UNPUBLISHED");

    await simAws.backgroundTasksComplete();
    assertIdentical(simCloudFrontFunction.status, "UNASSOCIATED");

    const cffResponse = await simCloudFrontFunction.handleViewerRequest(
      new Request("http://foobar.cloudfront.net/foo/bar/object.json"),
    );
    assertInstanceOf(cffResponse, Request);
    const url = new URL(cffResponse.url);
    assertIdentical(url.pathname, "/changed/object.json");
  });

  it("creates viewer-request CloudFront Function from source code", async () => {
    const simAws = new SimAws();
    const simCloudFront = simAws.cloudFront();

    const cffName = "viewer-request-cff" as SimCloudFrontFunctionName;
    await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: cffName,
        FunctionConfig: {
          Comment: "Viewer Request CloudFront Function",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: Buffer.from(`
          function handler(event) {
            event.request.uri = event.request.uri.replace("/foo/bar/", "/changed/");
            return event.request;
          }
        `),
      }),
    );

    await simAws.backgroundTasksComplete();

    const simCloudFrontFunction =
      simCloudFront.getCloudFrontFunctionByName(cffName);
    assertInstanceOf(simCloudFrontFunction, SimCloudFrontFunction);
    const cffResponse = await simCloudFrontFunction.handleViewerRequest(
      new Request("http://foobar.cloudfront.net/foo/bar/object.json"),
    );
    assertInstanceOf(cffResponse, Request);
    const url = new URL(cffResponse.url);
    assertIdentical(url.pathname, "/changed/object.json");
  });

  it("creates viewer-response CloudFront Function from handler function reference", async () => {
    const simAws = new SimAws();
    const simCloudFront = simAws.cloudFront();

    const cffName = "viewer-response-cff" as SimCloudFrontFunctionName;
    const functionCreation = await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: cffName,
        FunctionConfig: {
          Comment: "Viewer Response CloudFront Function",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(viewerResponseHandlerFunction),
      }),
    );
    assertIdentical(functionCreation.FunctionSummary.Status, "UNPUBLISHED");

    const simCloudFrontFunction =
      simCloudFront.getCloudFrontFunctionByName(cffName);
    assertIdentical(simCloudFrontFunction?.name, cffName);
    assertIdentical(simCloudFrontFunction.status, "UNPUBLISHED");

    await simAws.backgroundTasksComplete();
    assertIdentical(simCloudFrontFunction.status, "UNASSOCIATED");

    const cffResponse = await simCloudFrontFunction.handleViewerResponse(
      new Request("http://foobar.cloudfront.net/foo/bar/object.json"),
      new Response("OK", { status: 200 }),
    );
    assertInstanceOf(cffResponse, Response);
    assertIdentical(cffResponse.headers.get("x-changed-by"), "foobar handler");
  });

  it("creates viewer-response CloudFront Function from source code", async () => {
    const simAws = new SimAws();
    const simCloudFront = simAws.cloudFront();

    const cffName = "viewer-response-cff" as SimCloudFrontFunctionName;
    await simCloudFront.createFunction(
      new CreateFunctionCommand({
        Name: cffName,
        FunctionConfig: {
          Comment: "Viewer Request CloudFront Function",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: Buffer.from(`
          function handler(event) {
            event.response.headers["x-changed-by"] = { value: "foobar handler" };
            return event.response;
          }
        `),
      }),
    );

    await simAws.backgroundTasksComplete();

    const simCloudFrontFunction =
      simCloudFront.getCloudFrontFunctionByName(cffName);
    assertInstanceOf(simCloudFrontFunction, SimCloudFrontFunction);
    const cffResponse = await simCloudFrontFunction.handleViewerResponse(
      new Request("http://foobar.cloudfront.net/foo/bar/object.json"),
      new Response("OK", { status: 200 }),
    );
    assertInstanceOf(cffResponse, Response);
    assertIdentical(cffResponse.headers.get("x-changed-by"), "foobar handler");
  });
});

const viewerRequestHandlerFunction: CloudFrontFunction.ViewerRequestHandler = (
  event: CloudFrontFunction.ViewerRequestEvent,
) => {
  event.request.uri = event.request.uri.replace("/foo/bar/", "/changed/");
  return event.request;
};

const viewerResponseHandlerFunction: CloudFrontFunction.ViewerResponseHandler =
  (event: CloudFrontFunction.ViewerResponseEvent) => {
    event.response.headers["x-changed-by"] = { value: "foobar handler" };
    return event.response;
  };
