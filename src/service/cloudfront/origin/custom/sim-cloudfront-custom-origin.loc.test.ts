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

describe("Serving a sim CloudFront custom Origin on localhost", () => {
  it("reaches the Origin in process for a real localhost request", async () => {
    // Given a function behind a public Function URL.
    const simAws = new SimAws();
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "greeter",
        Role: "arn:aws:iam::111111111111:role/GreeterRole",
        Code: {
          ZipFile: makeLambdaZipFileInput(
            (event: { rawPath?: string; body?: string }) => ({
              statusCode: 200,
              headers: { "content-type": "text/plain" },
              body: `${event.rawPath ?? ""} ${event.body ?? ""}`.trim(),
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
            ViewerProtocolPolicy: "allow-all",
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
      // When the Distribution is requested over localhost.
      const response = await fetch(
        srv.localUrl(`http://${distroHostname}/greet`),
        { method: "POST", body: "Yulin" },
      );

      // Then the Origin served it, over the same request path and body.
      assertResponseStatus(response, 200, await describeResponse(response));
      assertIdentical(await response.text(), "/greet Yulin");
    } finally {
      await srv.close();
    }
  });
});
