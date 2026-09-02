import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { serveSimAws } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../../lambda/function/code/lambda-zip-file-input.js";
import { simCfManagedOriginRequestPolicyIds } from "../../origin-request-policy/sim-cf-managed-origin-request-policies.js";

describe("Serving a sim CloudFront custom Origin on localhost", () => {
  it("presents the AWS-facing viewer Origin to a custom Origin", async () => {
    // Given a function reporting the request it receives.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(
            (event: {
              rawPath?: string;
              body?: string;
              headers?: Record<string, string>;
            }) => ({
              statusCode: 200,
              headers: { "content-type": "text/plain" },
              body: JSON.stringify({
                path: event.rawPath,
                body: event.body,
                origin: event.headers?.["origin"],
              }),
            }),
          ),
        },
      }),
    );
    const { FunctionUrl: functionUrl } = await simAws
      .lambda()
      .createFunctionUrlConfig(
        new CreateFunctionUrlConfigCommand({
          FunctionName: "greeter",
          AuthType: "NONE",
        }),
      );
    assertNonNullable(functionUrl);

    // And a Distribution fronting it as a custom Origin.
    const creation = await simAws.cloudFront().createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "localhost-custom-origin",
          Comment: "Localhost custom Origin CDN",
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
            ViewerProtocolPolicy: "redirect-to-https",
            OriginRequestPolicyId:
              simCfManagedOriginRequestPolicyIds.allViewerExceptHostHeader,
            AllowedMethods: {
              Quantity: 3,
              Items: ["GET", "HEAD", "POST"],
              CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
            },
          },
        },
      }),
    );
    const distroHostname = creation.Distribution?.DomainName;
    assertNonNullable(distroHostname);

    const srv = await serveSimAws({ simAws });

    try {
      // When a browser sends its local same-origin value through CloudFront.
      const viewerUrl = srv.localUrl(`https://${distroHostname}/greet`);
      const response = await fetch(viewerUrl, {
        method: "POST",
        headers: { origin: viewerUrl.origin },
        body: "Yulin",
      });

      // Then the custom Origin receives the production URL with the request.
      assertResponseStatus(response, 200, await describeResponse(response));
      assertIdentical(
        await response.text(),
        JSON.stringify({
          path: "/greet",
          body: "Yulin",
          origin: `https://${distroHostname}`,
        }),
      );
    } finally {
      await srv.close();
    }
  });
});
