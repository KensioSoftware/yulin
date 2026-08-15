import {
  assertIdentical,
  assertObjectEquals,
  assertResponseStatus,
  assertTypeString,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsServiceRequest } from "../../../../serve/controller/sim-service-controller.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import { simAwsCallerHeaderName } from "../../../iam/request/sim-aws-caller-header.js";
import {
  simAwsSourceAccountHeaderName,
  simAwsSourceArnHeaderName,
} from "../../../iam/request/sim-aws-request-source.js";
import { SimCloudFrontServiceController } from "../../controller/sim-cloudfront-controller.js";
import { simCfFunctionUrlOriginTemplateFactory } from "./sim-cf-function-url-origin-template.factory.js";

const accountId = "888888888888";

/**
 * Deploy the Stack and fetch a path through the Distribution it created.
 *
 * The viewer's headers are built from the deployed Distribution's ARN, so a
 * test about what a viewer may state can state the one thing that would work.
 */
async function fetchThroughDistribution(
  template: CfnTemplateBodyRecord,
  viewerHeaders: (
    distributionArn: string,
  ) => Record<string, string> = () => ({}),
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
  const request = new Request(url, {
    headers: viewerHeaders(distributionArn),
  });

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

describe("Simulated CloudFront custom Origin with an origin access control", () => {
  it("reaches an AWS_IAM Function URL as the CloudFront service principal", async () => {
    // Given a Stack putting a Function URL behind an origin access control,
    // granting CloudFront both of the actions that takes.
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({}),
    );

    // Then the handler ran, which an Origin reached anonymously could never
    // get past the auth type to do.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "Hello from behind CloudFront");
  });

  it("is refused when only the Function URL action is granted", async () => {
    // Given a permission granting `lambda:InvokeFunctionUrl` and nothing else,
    // which is what CDK writes and what reads as correctly configured
    // everywhere a deployment can be inspected.
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({
        permittedActions: ["lambda:InvokeFunctionUrl"],
      }),
    );

    // Then the Function URL refuses the Origin request, as real Lambda does
    // without `lambda:InvokeFunction` as well, and says so in the body that is
    // the only diagnostic a refused request leaves behind.
    assertResponseStatus(response, 403, await describeResponse(response));
    assertObjectEquals(await response.json(), {
      Message:
        "Forbidden. For troubleshooting Function URL authorization issues, " +
        "see: https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html",
    });
  });

  it("is refused when only the Invoke action is granted", async () => {
    // Given the other half of the pair on its own.
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({
        permittedActions: ["lambda:InvokeFunction"],
      }),
    );

    // Then the Function URL refuses it too: reaching the URL takes both.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("is refused when nothing granted CloudFront the Function URL", async () => {
    // Given the same Stack without the AWS::Lambda::Permission, which is the
    // template mistake this is worth catching.
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({ permitted: false }),
    );

    // Then the Function URL refuses the Origin request, and the refusal is
    // what the viewer sees, rather than the Distribution admitting it anyway.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("is refused when the permission names another Distribution", async () => {
    // Given a permission granted for a Distribution other than this one.
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({
        permissionSourceArn: `arn:aws:cloudfront::${accountId}:distribution/E1OTHER123`,
      }),
    );

    // Then the Origin request carries the Distribution it really came from, so
    // the condition does not match and the Function URL refuses it.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("does not let a viewer state who the Origin request is from", async () => {
    // Given a Distribution whose Origin has no origin access control, and a
    // viewer claiming to be CloudFront reaching the Function URL for that
    // Distribution, which is the one claim that would work if it got through.
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({
        originAccessControl: false,
      }),
      (distributionArn) => ({
        [simAwsCallerHeaderName]: "service:cloudfront.amazonaws.com",
        [simAwsSourceArnHeaderName]: distributionArn,
        [simAwsSourceAccountHeaderName]: accountId,
      }),
    );

    // Then the claim is dropped rather than forwarded, so the Origin request
    // is the anonymous one the Origin really makes and the URL refuses it.
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("reaches the Origin anonymously when the origin access control never signs", async () => {
    // Given an origin access control turned off with a `never` signing
    // behaviour, and the permission still in place.
    const response = await fetchThroughDistribution(
      simCfFunctionUrlOriginTemplateFactory.make({ signingBehavior: "never" }),
    );

    // Then nothing states who the Origin request is from, so the AWS_IAM
    // Function URL refuses it, as it refuses any anonymous request.
    assertResponseStatus(response, 403, await describeResponse(response));
  });
});
