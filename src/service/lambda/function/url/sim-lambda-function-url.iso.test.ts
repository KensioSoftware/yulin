import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simLambdaFunctionUrlFactory } from "./sim-lambda-function-url.factory.js";

describe("Sim Lambda Function URL", () => {
  it("builds the AWS endpoint URL for its scope", () => {
    // Given a Function URL in eu-west-2.
    const functionUrl = simLambdaFunctionUrlFactory.make();

    // When its endpoint is read.
    const url = functionUrl.url;

    // Then the URL names the region and ends with a trailing slash.
    assertIdentical(
      url,
      `https://${functionUrl.urlId}.lambda-url.eu-west-2.on.aws/`,
    );
    assertStringIncludes(functionUrl.hostname, ".lambda-url.eu-west-2.on.aws");
  });

  it("defaults to a public buffered endpoint", () => {
    // Given a Function URL created without configuration.
    const functionUrl = simLambdaFunctionUrlFactory.make();

    // When its configuration is read.
    const configuration = functionUrl.configuration();

    // Then it takes the AWS defaults.
    assertIdentical(configuration.AuthType, "NONE");
    assertIdentical(configuration.InvokeMode, "BUFFERED");
    assertIdentical(configuration.CreationTime, configuration.LastModifiedTime);
  });

  it("keeps values that an update omits", () => {
    // Given a Function URL with a non-default invoke mode.
    const functionUrl = simLambdaFunctionUrlFactory.make();
    functionUrl.update({ invokeMode: "RESPONSE_STREAM" });

    // When only the auth type is updated.
    functionUrl.update({ authType: "AWS_IAM" });

    // Then both values are in place.
    assertIdentical(functionUrl.authType, "AWS_IAM");
    assertIdentical(functionUrl.invokeMode, "RESPONSE_STREAM");
  });

  it("keeps its endpoint across updates", () => {
    // Given a Function URL.
    const functionUrl = simLambdaFunctionUrlFactory.make();
    const url = functionUrl.url;

    // When it is updated.
    functionUrl.update({ authType: "AWS_IAM" });

    // Then the endpoint is unchanged, as it is on AWS.
    assertIdentical(functionUrl.url, url);
  });
});
