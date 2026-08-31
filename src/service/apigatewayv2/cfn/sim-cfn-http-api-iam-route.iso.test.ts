import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertResponseStatus,
  assertTypeString,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployHttpApi,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

const accountId = "888888888888";
const reporterArn = `arn:aws:iam::${accountId}:role/Reporter`;

/**
 * A Role allowed every `execute-api` resource, so what the test turns on is
 * whether the deployed route asks IAM at all.
 */
async function reporterRole(simAws: SimAws): Promise<void> {
  const iam = simAws.iam();
  await iam.createRole(
    new CreateRoleCommand({
      RoleName: "Reporter",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await iam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "Reporter",
      PolicyName: "InvokeApi",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: "execute-api:Invoke", Resource: "*" },
      }),
    }),
  );
}

describe("Deploying an IAM-authorized AWS::ApiGatewayV2::Route", () => {
  it("deploys the route CDK's HttpIamAuthorizer emits, and closes it", async () => {
    // Given the Route properties CDK synthesises for an HttpIamAuthorizer,
    // which are AuthorizationType alone, with no Authorizer Resource at all
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        routeKeys: ["GET /orders"],
        routeProperties: { AuthorizationType: "AWS_IAM" },
      }),
    );
    await reporterRole(simAws);

    // When the deployed route is called with nothing, and then as a Role
    // allowed to invoke it
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    assertTypeString(apiEndpoint);
    const url = new SimAwsLocalUrl({
      input: `${apiEndpoint}/orders`,
    }).toString();
    const simAwsHttp = new SimAwsHttp({ simAws });
    const anonymous = await simAwsHttp.fetch(url);
    const reporter = await simAwsHttp.fetch(url, {
      headers: { [simAwsCallerHeaderName]: reporterArn },
    });

    // Then the stack deployed, and the route it deployed is one IAM decides
    assertResponseStatus(anonymous, 403, await describeResponse(anonymous));
    assertResponseStatus(reporter, 200, await describeResponse(reporter));
    assertIdentical(await reporter.text(), '"orders"');
  });
});
