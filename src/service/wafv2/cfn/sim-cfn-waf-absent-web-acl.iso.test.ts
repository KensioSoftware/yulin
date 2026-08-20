import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployRestApi,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import {
  simWafAssociationResource,
  simWafMixedAclResource,
  simWafRealAccountAclArn,
  simWafStageArn,
} from "../../../../test/wafv2/best-effort-fixture.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { simCfnRestApiTemplateFactory } from "../../apigateway/cfn/sim-cfn-rest-api-template.factory.js";
import type { SimCfnStack } from "../../cloudformation/stack/sim-cfn-stack.js";

/**
 * The reason a skipped association gives, as far as it is worth asserting.
 */
const absent = "which this simulation does not hold";

/**
 * The one Resource a deployment skipped, and why.
 */
function skippedReason(stack: SimCfnStack): string {
  assertArrayLength(stack.skippedResources, 1);

  return stack.skippedResources[0].skippedReason ?? "";
}

describe("An association naming a web ACL that is not here", () => {
  it("skips, and the stage it named still serves", async () => {
    // Given a template associating a REST API stage with a web ACL from a real
    // account, which is what a stack deployed against AWS as well as here
    // carries.
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        handlerSource:
          "exports.handler = async () => ({ statusCode: 200, body: 'orders' });",
        methods: [{ httpMethod: "GET", path: ["orders"] }],
        resources: {
          OrdersAclAssociation: simWafAssociationResource(
            simWafStageArn,
            simWafRealAccountAclArn,
          ),
        },
      }),
    );
    const apiUrl = stack.outputs.get("ApiUrl")?.value;

    assertTypeString(apiUrl);

    // When the stage is requested.
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({ input: `${apiUrl}orders` }).toString(),
    );

    // Then the stage deployed and serves, unprotected, and the association is
    // the only Resource that went missing. An association is the only Resource
    // carrying that reference, so nothing else goes with it.
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "orders");
    assertStringIncludes(skippedReason(stack), absent);
  });

  it("leaves the user pool it named unprotected", async () => {
    // Given a template associating a user pool with a web ACL from a real
    // account.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "real-acl",
      template: {
        Resources: {
          Pool: {
            Type: "AWS::Cognito::UserPool",
            Properties: { UserPoolName: "orders-pool" },
          },
          PoolAclAssociation: simWafAssociationResource(
            { "Fn::GetAtt": ["Pool", "Arn"] },
            simWafRealAccountAclArn,
          ),
        },
        Outputs: { PoolArn: { Value: { "Fn::GetAtt": ["Pool", "Arn"] } } },
      },
    });
    await stack.waitForDeployComplete();

    const poolArn = stack.outputs.get("PoolArn")?.value;

    assertTypeString(poolArn);

    // Then the pool deployed with nothing in front of it.
    assertIdentical(stack.resources.get("Pool")?.status, "CREATE_COMPLETE");
    assertFalse(simAws.wafV2().protection().protects(poolArn));
    assertStringIncludes(skippedReason(stack), simWafRealAccountAclArn);
  });

  it("skips an association naming a resource type Yulin does not protect", async () => {
    // Given a template whose association points at a load balancer, which AWS
    // WAF protects and Yulin does not simulate.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "balanced",
      template: {
        Resources: {
          OrdersAcl: simWafMixedAclResource,
          BalancerAclAssociation: simWafAssociationResource(
            "arn:aws:elasticloadbalancing:eu-west-2:111111111111:" +
              "loadbalancer/app/orders/50dc6c495c0c9188",
          ),
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the web ACL deployed and only the association was skipped, naming
    // the resource type it would have gone in front of.
    assertArrayLength(simAws.wafV2().allWebAcls("REGIONAL"), 1);
    assertStringIncludes(skippedReason(stack), "an Application Load Balancer");
  });

  it("associates the web ACL when it is there, dropped rule and all", async () => {
    // Given a template whose association names the web ACL beside it, which
    // lost a rule this simulation cannot evaluate.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "pool",
      template: {
        Resources: {
          OrdersAcl: simWafMixedAclResource,
          Pool: {
            Type: "AWS::Cognito::UserPool",
            Properties: { UserPoolName: "orders-pool" },
          },
          PoolAclAssociation: simWafAssociationResource({
            "Fn::GetAtt": ["Pool", "Arn"],
          }),
        },
        Outputs: { PoolArn: { Value: { "Fn::GetAtt": ["Pool", "Arn"] } } },
      },
    });
    await stack.waitForDeployComplete();

    const poolArn = stack.outputs.get("PoolArn")?.value;

    assertTypeString(poolArn);

    // Then the pool is protected by what the web ACL still holds. A dropped
    // rule is not a reason to leave the pool with nothing in front of it.
    assertArrayLength(stack.skippedResources, 0);
    assertTrue(simAws.wafV2().protection().protects(poolArn));
  });
});
