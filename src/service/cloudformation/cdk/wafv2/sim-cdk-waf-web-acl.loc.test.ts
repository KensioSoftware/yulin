import path from "node:path";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and deploys the synthesized web ACL, its association and the
 * REST API behind it through sim CloudFormation.
 *
 * CDK ships no L2 construct for WAFv2, so this is what a team protecting an
 * API actually writes: the generated L1s, wired together by
 * `webAcl.attrArn` and `api.deploymentStage.stageArn`. Whatever those two
 * resolve to at synth time is what the simulator has to read.
 */
const ordersHandlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: "order " + (event.pathParameters?.proxy ?? "none"),
});
`;

const cdkApp = `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const ordersFunction = new lambda.Function(stack, "OrdersFunction", {
  functionName: "cdk-waf-orders",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(ordersHandlerSource)}),
});

const api = new apigw.LambdaRestApi(stack, "OrdersApi", {
  restApiName: "orders",
  handler: ordersFunction,
});

const webAcl = new wafv2.CfnWebACL(stack, "ApiAcl", {
  scope: "REGIONAL",
  defaultAction: { allow: {} },
  visibilityConfig: {
    sampledRequestsEnabled: false,
    cloudWatchMetricsEnabled: false,
    metricName: "api",
  },
  rules: [
    {
      name: "block-admin",
      priority: 0,
      action: { block: {} },
      statement: {
        byteMatchStatement: {
          fieldToMatch: { uriPath: {} },
          positionalConstraint: "CONTAINS",
          searchString: "/admin",
          textTransformations: [{ priority: 0, type: "NONE" }],
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: false,
        cloudWatchMetricsEnabled: false,
        metricName: "block-admin",
      },
    },
    {
      name: "orders-rate",
      priority: 1,
      action: { block: {} },
      statement: {
        rateBasedStatement: {
          limit: 10,
          evaluationWindowSec: 300,
          aggregateKeyType: "IP",
          scopeDownStatement: {
            byteMatchStatement: {
              fieldToMatch: { uriPath: {} },
              positionalConstraint: "CONTAINS",
              searchString: "/orders",
              textTransformations: [{ priority: 0, type: "NONE" }],
            },
          },
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: false,
        cloudWatchMetricsEnabled: false,
        metricName: "orders-rate",
      },
    },
  ],
});

new wafv2.CfnWebACLAssociation(stack, "ApiAclAssociation", {
  resourceArn: api.deploymentStage.stageArn,
  webAclArn: webAcl.attrArn,
});

new cdk.CfnOutput(stack, "ApiUrl", { value: api.url });
new cdk.CfnOutput(stack, "AclCapacity", {
  value: cdk.Token.asString(webAcl.attrCapacity),
});
new cdk.CfnOutput(stack, "AclLabels", { value: webAcl.attrLabelNamespace });

app.synth();
`;

describe("Sim CDK WAFv2 web ACL local integration", () => {
  it("blocks a request through a stage the CDK L1 constructs protected", async () => {
    // Given a CDK stack whose CfnWebACL and CfnWebACLAssociation put a web ACL
    // in front of a LambdaRestApi's stage.
    const simAws = new SimAws({
      defaultAccountId: "111111111111",
      defaultRegionName: "eu-west-2",
    });
    const cdkProject = new TestCdkProject();

    await cdkProject.writeCdkAppFile(cdkApp);

    // And the CDK app is synthesized to a CloudFormation template.
    const cdkOutDirectory = await cdkProject.synth();

    // When the synthesized template is deployed through sim CloudFormation.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );

    await stack.waitForDeployComplete();

    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);

    const http = new SimAwsHttp({ simAws });
    const request = async (suffix: string): Promise<Response> =>
      await http.fetch(
        new SimAwsLocalUrl({ input: `${apiUrl}${suffix}` }).toString(),
      );

    const blocked = await request("admin/settings");
    const allowed = await request("orders/YL-1");

    // Then the request the web ACL claims got WAF's 403 from the stage, and
    // the one it did not reached the function behind it.
    assertIdentical(blocked.status, 403);
    assertStringIncludes(await blocked.text(), "Request blocked by AWS WAF");
    assertIdentical(allowed.status, 200);
    assertIdentical(await allowed.text(), "order orders/YL-1");

    // And the rate limit the same template wrote counts the requests it
    // scoped itself down to. The `allowed` request above was the first of
    // them, so the tenth of these ten is the eleventh in the window and the
    // one that gets WAF's 403.
    const rated: Response[] = [];

    for (let sent = 0; sent < 10; sent += 1) {
      // A rate limit counts what arrives in order, and requests sent together
      // arrive in no order at all.
      // oxlint-disable-next-line no-await-in-loop
      rated.push(await request("orders/YL-1"));
    }

    assertIdentical(rated[8]?.status, 200);
    assertIdentical(rated[9]?.status, 403);

    // And the attributes CDK reads off the L1 resolved to the deployed web
    // ACL's own, rather than to a token nothing filled in.
    const webAcl = simAws.wafV2().allWebAcls("REGIONAL")[0];

    assertNonNullable(webAcl);
    assertIdentical(stack.outputs.get("AclCapacity")?.value, webAcl.capacity);
    assertIdentical(
      stack.outputs.get("AclLabels")?.value,
      `awswaf:111111111111:webacl:${webAcl.name}:`,
    );
  });
});
