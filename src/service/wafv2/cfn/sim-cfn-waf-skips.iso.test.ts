import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployRestApi,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { simCfnRestApiTemplateFactory } from "../../apigateway/cfn/sim-cfn-rest-api-template.factory.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnStack } from "../../cloudformation/stack/sim-cfn-stack.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "orders",
};

/**
 * A rule counting requests over a time window, which is the statement kind
 * Yulin does not evaluate that a real stack is most likely to carry: CDK's
 * sign-up protection for a user pool writes one.
 */
const rateLimitSignUps = {
  Name: "account-creation-rate",
  Priority: 0,
  Action: { Block: {} },
  Statement: {
    RateBasedStatement: { Limit: 100, AggregateKeyType: "IP" },
  },
  VisibilityConfig: { ...visibility, MetricName: "account-creation-rate" },
};

/**
 * A web ACL whose one rule Yulin cannot evaluate.
 */
const rateLimitedAcl = {
  Type: "AWS::WAFv2::WebACL",
  Properties: {
    Name: "orders-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [rateLimitSignUps],
  },
};

/**
 * An association putting the web ACL beside it in front of something.
 */
function associationResource(
  resourceArn: SimCfnTemplateValueRecord | string,
): SimCfnTemplateValueRecord {
  return {
    Type: "AWS::WAFv2::WebACLAssociation",
    Properties: {
      ResourceArn: resourceArn,
      WebACLArn: { "Fn::GetAtt": ["OrdersAcl", "Arn"] },
    },
  };
}

/**
 * A user pool behind the rate limited web ACL, which is the shape of the stack
 * this reporting was written for: a template whose other Resources have
 * nothing to do with WAF.
 */
const poolTemplate: CfnTemplateBodyRecord = {
  Resources: {
    OrdersAcl: rateLimitedAcl,
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
    PoolAclAssociation: associationResource({ "Fn::GetAtt": ["Pool", "Arn"] }),
  },
  Outputs: { PoolArn: { Value: { "Fn::GetAtt": ["Pool", "Arn"] } } },
};

async function deployPool(simAws: SimAws): Promise<SimCfnStack> {
  const stack = await simAws
    .cloudFormation()
    .deployTemplate({ stackName: "pool", template: poolTemplate });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * The Resource a deployment recorded as skipped under one logical id.
 */
function skipped(stack: SimCfnStack, logicalId: string): SimCfnResource {
  const resource = stack.skippedResources.find(
    (candidate) => candidate.logicalId === logicalId,
  );

  assertNonNullable(resource);

  return resource;
}

describe("A WAFv2 Resource carrying something Yulin cannot evaluate", () => {
  it("skips the web ACL and deploys the rest of the template", async () => {
    // Given a template whose web ACL rate limits sign-ups, beside a user pool
    // and a table that know nothing about WAF.
    const simAws = simAwsInEuWest2();
    const stack = await deployPool(simAws);

    // Then the pool and the table deployed, and no web ACL was created.
    assertIdentical(stack.resources.get("Pool")?.status, "CREATE_COMPLETE");
    assertIdentical(stack.resources.get("Orders")?.status, "CREATE_COMPLETE");
    assertArrayLength(simAws.wafV2().allWebAcls("REGIONAL"), 0);
  });

  it("records the rule and the statement kind it could not evaluate", async () => {
    // Given the deployed stack.
    const simAws = simAwsInEuWest2();
    const stack = await deployPool(simAws);

    // Then the web ACL is on the skipped Resources, saying which rule was
    // unevaluatable and what in it: the same reason CreateWebACL gives an SDK
    // caller, under the logical id that declared it.
    const reason = skipped(stack, "OrdersAcl").skippedReason ?? "";

    assertStringIncludes(reason, "AWS::WAFv2::WebACL Resource OrdersAcl");
    assertStringIncludes(reason, "Rule account-creation-rate");
    assertStringIncludes(reason, "RateBasedStatement");
    assertStringIncludes(reason, "which Yulin does not simulate");
  });

  it("skips the association that named the web ACL", async () => {
    // Given the deployed stack, whose association pointed at the web ACL.
    const simAws = simAwsInEuWest2();
    const stack = await deployPool(simAws);
    const poolArn = stack.outputs.get("PoolArn")?.value;

    assertTypeString(poolArn);

    // Then the association went with it, saying what it lost, and nothing is
    // in front of the pool.
    assertStringIncludes(
      skipped(stack, "PoolAclAssociation").skippedReason ?? "",
      "the web ACL it names, OrdersAcl, was skipped",
    );
    assertFalse(simAws.wafV2().protection().protects(poolArn));
  });

  it("associates a web ACL that is there while another one was skipped", async () => {
    // Given a template holding two web ACLs, one Yulin cannot evaluate and one
    // it can, with an association naming the second and waiting on the first.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "two-acls",
      template: {
        Resources: {
          OrdersAcl: rateLimitedAcl,
          ReportsAcl: {
            ...rateLimitedAcl,
            Properties: {
              ...rateLimitedAcl.Properties,
              Name: "reports-acl",
              Rules: [],
            },
          },
          Pool: {
            Type: "AWS::Cognito::UserPool",
            Properties: { UserPoolName: "orders-pool" },
          },
          PoolAclAssociation: {
            Type: "AWS::WAFv2::WebACLAssociation",
            DependsOn: ["OrdersAcl"],
            Properties: {
              ResourceArn: { "Fn::GetAtt": ["Pool", "Arn"] },
              WebACLArn: { "Fn::GetAtt": ["ReportsAcl", "Arn"] },
            },
          },
        },
        Outputs: { PoolArn: { Value: { "Fn::GetAtt": ["Pool", "Arn"] } } },
      },
    });
    await stack.waitForDeployComplete();

    const poolArn = stack.outputs.get("PoolArn")?.value;

    assertTypeString(poolArn);

    // Then only the web ACL that could not be evaluated was skipped. The
    // association named the other one, and depending on a skipped Resource is
    // not the same as pointing at it.
    assertArrayLength(stack.skippedResources, 1);
    assertIdentical(stack.skippedResources[0].logicalId, "OrdersAcl");
    assertTrue(simAws.wafV2().protection().protects(poolArn));
  });

  it("serves a request reaching a stage whose web ACL was skipped", async () => {
    // Given a REST API the template put the rate limited web ACL in front of.
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        handlerSource:
          "exports.handler = async () => ({ statusCode: 200, body: 'orders' });",
        methods: [{ httpMethod: "GET", path: ["orders"] }],
        resources: {
          OrdersAcl: rateLimitedAcl,
          OrdersAclAssociation: associationResource({
            "Fn::Join": [
              "",
              [
                "arn:aws:apigateway:",
                { Ref: "AWS::Region" },
                "::/restapis/",
                { Ref: "Api" },
                "/stages/",
                { Ref: "Stage" },
              ],
            ],
          }),
        },
      }),
    );
    const apiUrl = stack.outputs.get("ApiUrl")?.value;

    assertTypeString(apiUrl);

    // When a request is made to the stage.
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({ input: `${apiUrl}orders` }).toString(),
    );

    // Then the integration answered it, because no web ACL evaluated it. A
    // firewall that is visibly missing misleads nobody; the one to avoid is a
    // firewall that is there and quietly toothless.
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "orders");
    assertArrayLength(stack.skippedResources, 2);
  });

  it("skips an association naming a resource type Yulin does not protect", async () => {
    // Given a template whose web ACL is fine and whose association points at a
    // load balancer, which AWS WAF protects and Yulin does not simulate.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "balanced",
      template: {
        Resources: {
          OrdersAcl: {
            ...rateLimitedAcl,
            Properties: { ...rateLimitedAcl.Properties, Rules: [] },
          },
          BalancerAclAssociation: associationResource(
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
    assertStringIncludes(
      skipped(stack, "BalancerAclAssociation").skippedReason ?? "",
      "an Application Load Balancer",
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
              ...rateLimitedAcl,
              Properties: {
                ...rateLimitedAcl.Properties,
                Scope: "WORLDWIDE",
                Rules: [],
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
