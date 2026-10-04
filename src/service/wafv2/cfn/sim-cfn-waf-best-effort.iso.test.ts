import {
  assertArrayEmpty,
  assertArrayEquals,
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
  it("deploys the web ACL holding it, and the rest of the template", async () => {
    // Given a template whose web ACL rate limits sign-ups and blocks admin
    // paths, beside a user pool and a table that know nothing about WAF.
    const simAws = simAwsInEuWest2();
    const stack = await deployPool(simAws);

    // Then everything deployed, and the web ACL holds both rules as the
    // template wrote them.
    const [webAcl] = simAws.wafV2().allWebAcls("REGIONAL");

    assertIdentical(stack.getResource("Pool")?.status, "CREATE_COMPLETE");
    assertIdentical(stack.getResource("Orders")?.status, "CREATE_COMPLETE");
    assertArrayEmpty(stack.skippedResources);
    assertArrayLength(webAcl?.configuration.rules ?? [], 2);
  });

  it("records the rule and the statement kind it could not evaluate", async () => {
    // Given the deployed stack.
    const simAws = simAwsInEuWest2();
    const stack = await deployPool(simAws);

    // Then the held rule is on the ignored properties, under the logical id
    // that declared it and the name that tells it from the other rules. The
    // reason is the one unsimulatedParts gives an SDK caller.
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

    // When the path the evaluated rule blocks and one it allows are both
    // requested.
    const http = new SimAwsHttp({ simAws });
    const blocked = await http.fetch(
      new SimAwsLocalUrl({ input: `${apiUrl}admin` }).toString(),
    );
    const allowed = await http.fetch(
      new SimAwsLocalUrl({ input: `${apiUrl}orders` }).toString(),
    );

    // Then the web ACL is really in front of the stage, deciding by the rule
    // it evaluates. What the held rule would have blocked is served, which is
    // why the record of it is there.
    assertResponseStatus(blocked, 403, await describeResponse(blocked));
    assertResponseStatus(allowed, 200, await describeResponse(allowed));
    assertIdentical(await allowed.text(), "orders");
    assertIdentical(simWafIgnoredProperty(stack).path, "Rules.block-countries");
  });

  it("records a web ACL member it has no behaviour for", async () => {
    // Given a template whose web ACL configures the CAPTCHA action, which
    // needs a browser to answer it, and carries tags.
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
              Tags: [{ Key: "Team", Value: "payments" }],
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the web ACL deployed holding it and the tags the template gave it,
    // and the record says neither does anything here.
    assertArrayLength(simAws.wafV2().allWebAcls("REGIONAL"), 1);
    assertArrayEquals(
      stack.ignoredProperties.map(({ path }) => path),
      ["CaptchaConfig", "Tags"],
    );
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
