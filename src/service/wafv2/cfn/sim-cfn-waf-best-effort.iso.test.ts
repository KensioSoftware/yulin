import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployRestApi,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import {
  simWafAssociationResource,
  simWafBlockAdmin,
  simWafIgnoredProperty,
  simWafMixedAclResource,
  simWafStageArn,
} from "../../../../test/wafv2/best-effort-fixture.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { simCfnRestApiTemplateFactory } from "../../apigateway/cfn/sim-cfn-rest-api-template.factory.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";

/**
 * A user pool and a table behind the web ACL, which is the shape of the stack
 * this was written for. Most of a template has nothing to do with WAF.
 */
const poolTemplate: CfnTemplateBodyRecord = {
  Resources: {
    OrdersAcl: simWafMixedAclResource,
    Pool: {
      Type: "AWS::Cognito::UserPool",
      Properties: { UserPoolName: "orders-pool" },
    },
    Orders: {
      Type: "AWS::DynamoDB::Table",
      Properties: {
        TableName: "orders",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      },
    },
    PoolAclAssociation: simWafAssociationResource({
      "Fn::GetAtt": ["Pool", "Arn"],
    }),
  },
  Outputs: { PoolArn: { Value: { "Fn::GetAtt": ["Pool", "Arn"] } } },
};

async function deployPool(simAws: SimAws): Promise<SimCfnDeployedStack> {
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName: "pool", template: poolTemplate });
  await stack.waitForDeployComplete();

  return stack;
}

describe("A web ACL rule Yulin cannot evaluate", () => {
  it("deploys the web ACL without it, and the rest of the template", async () => {
    // Given a template whose web ACL rate limits sign-ups and blocks admin
    // paths, beside a user pool and a table that know nothing about WAF.
    const simAws = simAwsInEuWest2();
    const stack = await deployPool(simAws);

    // Then everything deployed. One rule went missing rather than the web ACL,
    // and rather than the Resources that had nothing to do with it.
    assertIdentical(stack.getResource("Pool")?.status, "CREATE_COMPLETE");
    assertIdentical(stack.getResource("Orders")?.status, "CREATE_COMPLETE");
    assertArrayEmpty(stack.skippedResources);
    assertArrayLength(simAws.wafV2().allWebAcls("REGIONAL"), 1);
  });

  it("records the rule and the statement kind it could not evaluate", async () => {
    // Given the deployed stack.
    const simAws = simAwsInEuWest2();
    const stack = await deployPool(simAws);

    // Then the dropped rule is on the ignored properties, under the logical id
    // that declared it and the name that tells it from the rules that stayed.
    // The reason is the one CreateWebACL gives an SDK caller.
    const property = simWafIgnoredProperty(stack);

    assertIdentical(property.logicalId, "OrdersAcl");
    assertIdentical(property.path, "Rules.block-countries");
    assertStringIncludes(property.reason, "Rule block-countries");
    assertStringIncludes(property.reason, "GeoMatchStatement");
    assertStringIncludes(property.reason, "which Yulin does not simulate");
  });

  it("keeps deciding requests by the rules it can evaluate", async () => {
    // Given a REST API behind a web ACL carrying both rules.
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        handlerSource:
          "exports.handler = async () => ({ statusCode: 200, body: 'orders' });",
        methods: [
          { httpMethod: "GET", path: ["orders"] },
          { httpMethod: "GET", path: ["admin"] },
        ],
        resources: {
          OrdersAcl: simWafMixedAclResource,
          OrdersAclAssociation: simWafAssociationResource(simWafStageArn),
        },
      }),
    );
    const apiUrl = stack.outputs.get("ApiUrl")?.value;

    assertTypeString(apiUrl);

    // When the path the surviving rule blocks and one it allows are both
    // requested.
    const http = new SimAwsHttp({ simAws });
    const blocked = await http.fetch(
      new SimAwsLocalUrl({ input: `${apiUrl}admin` }).toString(),
    );
    const allowed = await http.fetch(
      new SimAwsLocalUrl({ input: `${apiUrl}orders` }).toString(),
    );

    // Then the web ACL is really in front of the stage, deciding by what is
    // left of it. What the dropped rule would have blocked is served, which is
    // the cost of deploying at all and why the record of it is there.
    assertResponseStatus(blocked, 403, await describeResponse(blocked));
    assertResponseStatus(allowed, 200, await describeResponse(allowed));
    assertIdentical(await allowed.text(), "orders");
    assertIdentical(simWafIgnoredProperty(stack).path, "Rules.block-countries");
  });

  it("records a web ACL member it has no behaviour for", async () => {
    // Given a template whose web ACL configures the CAPTCHA action, which
    // needs a browser to answer it.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "captcha",
      template: {
        Resources: {
          OrdersAcl: {
            ...simWafMixedAclResource,
            Properties: {
              ...simWafMixedAclResource.Properties,
              Rules: [simWafBlockAdmin],
              CaptchaConfig: { ImmunityTimeProperty: { ImmunityTime: 300 } },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the web ACL deployed without it, and the record says what was left
    // unconfigured.
    assertArrayLength(simAws.wafV2().allWebAcls("REGIONAL"), 1);
    assertIdentical(simWafIgnoredProperty(stack).path, "CaptchaConfig");
    assertStringIncludes(
      simWafIgnoredProperty(stack).reason,
      "answered by a browser",
    );
  });

  it("fails the stack on a web ACL that is incoherent rather than unevaluatable", async () => {
    // Given a template whose web ACL is in neither scope WAFv2 has.
    const simAws = simAwsInEuWest2();
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "scoped",
        template: {
          Resources: {
            OrdersAcl: {
              ...simWafMixedAclResource,
              Properties: {
                ...simWafMixedAclResource.Properties,
                Scope: "WORLDWIDE",
              },
            },
          },
        },
      });
      await stack.waitForDeployComplete();
    });

    // Then the deployment failed, because nothing coherent could be deployed
    // from it, and the refusal names the logical id.
    assertStringIncludes(
      error.message,
      "Invalid AWS::WAFv2::WebACL Resource OrdersAcl",
    );
  });
});
