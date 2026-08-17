/**
 * Deploying a Lambda Function URL behind a Distribution, and fetching through
 * it, for tests about what such a Distribution admits.
 *
 * This lives under `test/` because two test files share it, and a file mixing
 * exported helpers with top-level `describe` calls is rejected by lint anyway.
 */

import { assertTypeString } from "@kensio/smartass";

import { SimAwsServiceRequest } from "../../src/serve/controller/sim-service-controller.js";
import { SimAwsLocalUrl } from "../../src/serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../src/service/cloudformation/template/sim-cfn-template.js";
import { SimCloudFrontServiceController } from "../../src/service/cloudfront/controller/sim-cloudfront-controller.js";

/**
 * How a test states the request the viewer makes.
 *
 * The deployed Distribution's ARN is passed in, so a test about what a viewer
 * may state can state the one thing that would work.
 */
export type ViewerRequest = (distributionArn: string) => RequestInit;

/**
 * Deploy the Stack and fetch a path through the Distribution it created.
 */
export async function fetchThroughDistribution(
  template: CfnTemplateBodyRecord,
  viewerRequest: ViewerRequest = () => ({}),
): Promise<Response> {
  const simAws = new SimAws();
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName: "site-stack", template });
  await stack.waitForDeployComplete();

  const domainName = stack.outputs.get("DistributionDomainName")?.value;
  const distributionArn = stack.outputs.get("DistributionArn")?.value;
  assertTypeString(domainName);
  assertTypeString(distributionArn);

  const url = new SimAwsLocalUrl({
    input: `https://${domainName}/greeting`,
  }).toString();
  const request = new Request(url, viewerRequest(distributionArn));

  // Straight to the CloudFront controller rather than through SimAwsHttp, so
  // that the request arrives as written. The HTTP boundary strips the
  // simulator's control headers, and a test about what a viewer can state to
  // an Origin has to be able to send them.
  return await new SimCloudFrontServiceController({ simAws }).handleRequest(
    new SimAwsServiceRequest({
      target: { service: "cloudFront", resourceName: "" },
      request,
    }),
  );
}
