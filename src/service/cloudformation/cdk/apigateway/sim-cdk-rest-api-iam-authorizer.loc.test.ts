import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { assertIdentical, assertTypeString } from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file, then serves the deployed REST API over real localhost HTTP
 * and calls its IAM-authorized method with a SigV4-signed request.
 */
import { signAwsRequest } from "../../../../../test/sigv4/sign-aws-request.js";
import { serveSimAws } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const accountId = "111111111111";

/**
 * Inline function code, as CDK packages Code.fromInline source. The handler
 * reports the caller the method's authorization attributed the request to.
 */
const ordersHandlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.requestContext.identity.userArn,
});
`;

/**
 * `AuthorizationType.IAM` emits the type alone on the Method. There is no
 * AWS::ApiGateway::Authorizer Resource in the synthesised template at all,
 * because IAM decides the method rather than a function of the API's.
 */
const cdkApp = `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "${accountId}", region: "eu-west-2" },
});

const ordersFunction = new lambda.Function(stack, "OrdersFunction", {
  functionName: "cdk-orders",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(ordersHandlerSource)}),
});

const api = new apigw.RestApi(stack, "OrdersApi", { restApiName: "orders" });

api.root
  .addResource("orders")
  .addMethod("GET", new apigw.LambdaIntegration(ordersFunction), {
    authorizationType: apigw.AuthorizationType.IAM,
  });

new cdk.CfnOutput(stack, "ApiUrl", { value: api.url });

app.synth();
`;

/**
 * A User allowed to invoke the deployed method, and the access key it signs
 * with.
 */
async function signingUser(
  simAws: SimAws,
): Promise<{ accessKeyId: string; secretAccessKey: string }> {
  const iam = simAws.iam();
  await iam.createUser(new CreateUserCommand({ UserName: "Reporter" }));
  await iam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "Reporter",
      PolicyName: "InvokeOrders",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Action: "execute-api:Invoke",
          Resource: `arn:aws:execute-api:eu-west-2:${accountId}:*/prod/GET/orders`,
        },
      }),
    }),
  );
  const key = await iam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "Reporter" }),
  );

  return {
    accessKeyId: key.AccessKey.AccessKeyId,
    secretAccessKey: key.AccessKey.SecretAccessKey,
  };
}

describe("Sim CDK REST API IAM authorization local integration", () => {
  it("closes a CDK-deployed method to everyone IAM does not allow", async () => {
    // Given a CDK stack whose one method is declared AuthorizationType.IAM
    const simAws = new SimAws({
      defaultAccountId: accountId as SimAwsAccountId,
      defaultRegionName: "eu-west-2",
    });
    const projectDirectory = new TemporaryDirectory();
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(cdkApp);

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the template into sim CloudFormation.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);

    // And a User of the API's Account is allowed to invoke that one method.
    const credentials = await signingUser(simAws);

    const srv = await serveSimAws({ simAws });

    try {
      const url = srv.localUrl(`${apiUrl}orders`).toString();

      // Then the deployed method is closed to a request carrying no identity.
      const anonymous = await fetch(url);
      assertIdentical(anonymous.status, 403);

      // And a request that User signed reaches the handler, which read their
      // ARN off the identity the method's authorization put in the event.
      const signed = await signAwsRequest({
        url,
        credentials,
        service: "execute-api",
        region: "eu-west-2",
      });
      const reporter = await fetch(signed.request);
      assertIdentical(reporter.status, 200);
      assertIdentical(
        await reporter.text(),
        `arn:aws:iam::${accountId}:user/Reporter`,
      );
    } finally {
      await srv.close();
    }

    await simAws.backgroundTasksComplete();
  });
});
