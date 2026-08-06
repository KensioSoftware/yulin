/**
 * Binding a local CloudFront Function handler during template deployment.
 */

import { SimAws } from "@kensio/yulin";
import type { CloudFrontFunction } from "@kensio/yulin/cloudfront";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

function viewerRequestHandler(
  event: CloudFrontFunction.ViewerRequestEvent,
): CloudFrontFunction.Request | CloudFrontFunction.Response {
  if (event.request.uri === "/redirect-me.html") {
    return {
      statusCode: 302,
      statusDescription: "Found",
      headers: {
        location: {
          value: "https://example.test/from-bound-handler.html",
        },
      },
    };
  }

  return event.request;
}

try {
  const stack = await simAws.cloudFormation().deployTemplateFile({
    templatePath: "cdk.out/TestStack.template.json",
    bindings: [
      {
        logicalId: "RewriteFunction",
        handler: viewerRequestHandler,
      },
    ],
  });

  await stack.waitForDeployComplete();

  const distributionResource = stack.getResource("SiteDistribution");
  const distribution = distributionResource?.simResource;

  if (
    distribution === undefined ||
    !("distributionId" in distribution) ||
    typeof distribution.distributionId !== "string"
  ) {
    throw new Error("Expected simulated CloudFront Distribution");
  }

  const distributionHost = `${distribution.distributionId.toLowerCase()}.cloudfront.net`;
  const response = await fetch(
    srv.localUrl(`http://${distributionHost}/redirect-me.html`),
    { redirect: "manual" },
  );

  console.log(response.status);
  console.log(response.headers.get("location"));
} finally {
  await srv.close();
}
