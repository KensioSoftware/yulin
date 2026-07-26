import { assertIdentical, assertTypeString } from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file, then serves the IAM-authenticated Function URL the app
 * granted over real localhost HTTP.
 */
import { serveSimAws } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../../iam/request/sim-aws-caller-header.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * The Account the stack is deployed into, which is the simulation's default.
 * Naming it in the CDK app too keeps the ARNs the app synthesizes and the
 * ARNs the simulator creates the same, so a granted principal can be named
 * from either side.
 */
const accountId = "888888888888";

const otherAccountId = "222222222222";

describe("Sim CDK Lambda grantInvokeUrl local integration", () => {
  it("deploys grantInvokeUrl grants that admit the granted principals", async () => {
    // Given a CDK stack whose IAM-authenticated Function URL is granted both
    // to a Role in the same Account, which CDK grants with an identity policy,
    // and to another Account, which CDK grants with an AWS::Lambda::Permission.
    const simAws = new SimAws();
    const projectDirectory = new TemporaryDirectory();
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: ${JSON.stringify(accountId)}, region: "eu-west-2" },
});

const reporterFunction = new lambda.Function(stack, "ReporterFunction", {
  functionName: "cdk-reporter",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(
    "exports.handler = async () => ({ statusCode: 200, body: 'reported' });",
  ),
});

const reporterUrl = reporterFunction.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.AWS_IAM,
});

const caller = new iam.Role(stack, "CallerRole", {
  roleName: "ReporterCaller",
  assumedBy: new iam.AccountRootPrincipal(),
});

reporterUrl.grantInvokeUrl(caller);
reporterUrl.grantInvokeUrl(new iam.AccountPrincipal(${JSON.stringify(otherAccountId)}));

new cdk.CfnOutput(stack, "ReporterFunctionUrl", {
  value: reporterUrl.url,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the template into sim CloudFormation and serve it.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    const functionUrl = stack.outputs.get("ReporterFunctionUrl")?.value;
    assertTypeString(functionUrl);

    const srv = await serveSimAws({ simAws });
    const invokeAs = async (arn: string): Promise<Response> =>
      await fetch(srv.localUrl(functionUrl), {
        headers: { [simAwsCallerHeaderName]: arn },
      });

    try {
      // Then the Role granted by identity policy reaches the function.
      const grantedRole = await invokeAs(
        `arn:aws:iam::${accountId}:role/ReporterCaller`,
      );
      assertIdentical(grantedRole.status, 200);
      assertIdentical(await grantedRole.text(), "reported");

      // And so does a principal in the Account granted by the deployed
      // AWS::Lambda::Permission, which is the only way a cross-account call
      // can be allowed at all.
      const grantedAccount = await invokeAs(
        `arn:aws:iam::${otherAccountId}:role/Anything`,
      );
      assertIdentical(grantedAccount.status, 200);

      // And a principal the app did not grant does not.
      const ungranted = await invokeAs(
        `arn:aws:iam::${accountId}:role/NotGranted`,
      );
      assertIdentical(ungranted.status, 403);
    } finally {
      srv.close();
    }

    await simAws.backgroundTasksComplete();
  });
});
