import {
  assertIdentical,
  assertInstanceOf,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsError,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { TemporaryDirectory as TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { CffUint8ArrayFunctionCodeExtractor } from "../function-code-input/cff-function-code-input.js";
import { SimCloudFrontFunction } from "../sim-cloudfront-function.js";
import { cloudFrontFunctionSourceFromModule } from "./cff-code-module-file.js";

describe("CloudFront Function source from module", () => {
  it("loads a viewer-request handler module into a sim CloudFront Function", async () => {
    const temporaryDirectory = new TemporaryDirectory();
    await temporaryDirectory.writeFile(
      "rewrite.cff.js",
      `
export function handler(event) {
  event.request.uri = "/rewritten.html";
  return event.request;
}
`,
    );

    const source = cloudFrontFunctionSourceFromModule(
      temporaryDirectory.join("rewrite.cff.js"),
    );
    const extractor = new CffUint8ArrayFunctionCodeExtractor(
      Buffer.from(source),
    );
    const handlerFunction = extractor.extractHandlerFunction();

    const simCff = new SimCloudFrontFunction({
      name: "rewrite-cff",
      handlerFunction,
    });

    const result = await simCff.handleViewerRequest(
      new Request("https://example.cloudfront.net/original.html"),
    );

    assertInstanceOf(result, Request);
    const url = new URL(result.url);
    assertIdentical(url.pathname, "/rewritten.html");
  });

  it("loads a viewer-response handler module into a sim CloudFront Function", async () => {
    const temporaryDirectory = new TemporaryDirectory();
    await temporaryDirectory.writeFile(
      "response.cff.js",
      `
export function handler(event) {
  event.response.statusCode = 201;
  event.response.statusDescription = "Created";
  event.response.headers["x-test"] = { value: "loaded-from-module" };
  return event.response;
}
`,
    );

    const source = cloudFrontFunctionSourceFromModule(
      temporaryDirectory.join("response.cff.js"),
    );
    const extractor = new CffUint8ArrayFunctionCodeExtractor(
      Buffer.from(source),
    );
    const handlerFunction = extractor.extractHandlerFunction();

    const simCff = new SimCloudFrontFunction({
      name: "response-cff",
      handlerFunction,
    });

    const result = await simCff.handleViewerResponse(
      new Request("https://example.cloudfront.net/object.html"),
      new Response(),
    );

    assertResponseStatus(result, 201, await describeResponse(result));
    assertIdentical(result.statusText, "Created");
    assertIdentical(result.headers.get("x-test"), "loaded-from-module");
  });

  it("loads a non-exported handler module into a sim CloudFront Function", async () => {
    const temporaryDirectory = new TemporaryDirectory();
    await temporaryDirectory.writeFile(
      "plain-handler.cff.js",
      `
function handler(event) {
  event.request.uri = "/plain-handler.html";
  return event.request;
}
`,
    );

    const source = cloudFrontFunctionSourceFromModule(
      temporaryDirectory.join("plain-handler.cff.js"),
    );
    const extractor = new CffUint8ArrayFunctionCodeExtractor(
      Buffer.from(source),
    );
    const handlerFunction = extractor.extractHandlerFunction();

    const simCff = new SimCloudFrontFunction({
      name: "plain-handler-cff",
      handlerFunction,
    });

    const result = await simCff.handleViewerRequest(
      new Request("https://example.cloudfront.net/original.html"),
    );

    assertInstanceOf(result, Request);
    const url = new URL(result.url);
    assertIdentical(url.pathname, "/plain-handler.html");
  });

  it("throws when the module does not contain a supported handler pattern", async () => {
    const temporaryDirectory = new TemporaryDirectory();
    await temporaryDirectory.writeFile(
      "unsupported.cff.js",
      `
export const handler = (event) => {
  return event.request;
};
`,
    );

    const error = assertThrowsError(() =>
      cloudFrontFunctionSourceFromModule(
        temporaryDirectory.join("unsupported.cff.js"),
      ),
    );

    assertStringIncludes(
      error.message,
      "CloudFront Function handler export pattern was not found",
    );
  });
});
