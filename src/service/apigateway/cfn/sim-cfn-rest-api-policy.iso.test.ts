import {
  assertArrayEmpty,
  assertIdentical,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployRestApi,
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import { simCfnImportedRestApiTemplateFactory } from "./sim-cfn-imported-rest-api-template.factory.js";
import { simCfnRestApiTemplateFactory } from "./sim-cfn-rest-api-template.factory.js";

/**
 * A policy allowing everyone one path, written with the shorthand CDK and
 * the developer guide use.
 */
function policy(path: string): object {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: "*",
        Action: "execute-api:Invoke",
        Resource: `execute-api:/${path}`,
      },
    ],
  };
}

/**
 * The resources the deployed API's policy names.
 */
function policyResources(simAws: SimAws, stack: SimCfnDeployedStack): string {
  const apiId = stack.getResource("Api")?.refValue;
  assertTypeString(apiId);
  const statements = simAws.apiGateway().findRestApi(apiId)?.policy
    ?.document.Statement;

  return JSON.stringify(
    [statements ?? []].flat().map((statement) => statement.Resource),
  );
}

describe("API Gateway REST API CloudFormation Policy", () => {
  it("creates the API with the policy it declares", async () => {
    // Given an API declaring a resource policy as an object
    const simAws = simAwsInEuWest2();

    // When the template is deployed
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        apiProperties: { Policy: policy("*") },
      }),
    );

    // Then the API holds it, expanded, and nothing is recorded as skipped
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    assertIdentical(
      policyResources(simAws, stack),
      JSON.stringify([`arn:aws:execute-api:eu-west-2:888888888888:${apiId}/*`]),
    );
    assertArrayEmpty(ignoredReasons(stack));
  });

  it("attaches the policy to an API declared as a Body", async () => {
    // Given an imported API whose Resource declares a policy as a string
    const simAws = simAwsInEuWest2();
    const template = simCfnImportedRestApiTemplateFactory.make({
      apiProperties: { Policy: JSON.stringify(policy("prod/*")) },
    });

    // When the template is deployed
    const stack = await deployRestApi(simAws, template);

    // Then the API holds it, as AWS attaches it after the import
    const apiId = stack.getResource("Api")?.refValue;
    assertTypeString(apiId);
    assertIdentical(
      policyResources(simAws, stack),
      JSON.stringify([
        `arn:aws:execute-api:eu-west-2:888888888888:${apiId}/prod/*`,
      ]),
    );
  });
});
