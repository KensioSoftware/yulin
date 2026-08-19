import {
  CreateDistributionCommand,
  CreateFunctionCommand as CreateCloudFrontFunctionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import { assertArrayEquals, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { serveSimAws } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/function/code/lambda-zip-file-input.js";
import { makeCffFunctionCodeInput } from "./function-code-input/cff-function-code-input.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";

describe("Set-Cookie through a viewer-response sim CloudFront Function", () => {
  const cookies = [
    "session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax",
    "state=; Path=/; Max-Age=0",
    "signed-in=1; Path=/",
  ];

  it("sends every cookie the Origin set", async () => {
    // Given a sign-in callback answering with three cookies.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "callback",
        Role: "arn:aws:iam::111111111111:role/CallbackRole",
        Code: {
          // The Function code is serialized, and cannot read the cookies
          // named above it.
          ZipFile: makeLambdaZipFileInput(() => ({
            statusCode: 303,
            headers: { location: "/" },
            cookies: [
              "session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax",
              "state=; Path=/; Max-Age=0",
              "signed-in=1; Path=/",
            ],
          })),
        },
      }),
    );
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "callback",
          AuthType: "NONE",
        }),
      );
    assertNonNullable(functionUrl);

    // And a viewer-response Function on the behaviour in front of it.
    function viewerResponseHandler(
      event: CloudFrontFunction.ViewerResponseEvent,
    ) {
      event.response.headers["x-frame-options"] = { value: "DENY" };
      return event.response;
    }
    const cffCreation = await simAws.cloudFront().createFunction(
      new CreateCloudFrontFunctionCommand({
        Name: "security-headers",
        FunctionConfig: {
          Comment: "Security headers",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(viewerResponseHandler),
      }),
    );

    const creation = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "viewer-response-set-cookie",
          Comment: "Sign-in CDN",
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: "function-origin",
                DomainName: new URL(functionUrl).hostname,
                CustomOriginConfig: {
                  HTTPPort: 80,
                  HTTPSPort: 443,
                  OriginProtocolPolicy: "https-only",
                },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "function-origin",
            ViewerProtocolPolicy: "allow-all",
            FunctionAssociations: {
              Quantity: 1,
              Items: [
                {
                  EventType: "viewer-response",
                  FunctionARN: cffCreation.FunctionMetadata.FunctionARN,
                },
              ],
            },
          },
        },
      }),
    );
    const distroHostname = creation.Distribution?.DomainName;
    assertNonNullable(distroHostname);

    const srv = await serveSimAws({ simAws });

    try {
      // When the viewer follows the callback.
      const response = await fetch(
        srv.localUrl(`http://${distroHostname}/user/callback`),
        { redirect: "manual" },
      );

      // Then it holds all three cookies, not only the last.
      assertArrayEquals(response.headers.getSetCookie(), cookies);
    } finally {
      await srv.close();
    }
  });
});
