import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertTypeString,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deployRestApi,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimRestApi } from "../../apigateway/api/sim-rest-api.js";
import { simCfnRestApiTemplateFactory } from "../../apigateway/cfn/sim-cfn-rest-api-template.factory.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "orders",
};

/**
 * The web ACL every association here puts in front of something: one rule,
 * blocking admin paths, over a default action of allow.
 */
const webAclResource = {
  Type: "AWS::WAFv2::WebACL",
  Properties: {
    Name: "orders-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "block-admin",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          ByteMatchStatement: {
            FieldToMatch: { UriPath: {} },
            PositionalConstraint: "CONTAINS",
            SearchString: "/admin",
            TextTransformations: [{ Priority: 0, Type: "NONE" }],
          },
        },
        VisibilityConfig: { ...visibility, MetricName: "block-admin" },
      },
    ],
  },
};

/**
 * The stage ARN as CDK writes it beside a REST API, which is the only
 * identifier AWS WAF takes for one.
 */
const stageArn = {
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
};

/**
 * An HTTP API stage ARN, which is the one API Gateway ARN AWS WAF protects
 * nothing behind.
 */
const httpApiStageArn =
  // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
  "arn:aws:apigateway:${AWS::Region}::/apis/abc123/stages/$default";

/**
 * An association Resource naming a web ACL in the same template.
 */
function associationResource(
  resourceArn: SimCfnTemplateValueRecord,
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
 * Deploy a REST API with the web ACL in front of its stage.
 */
async function deployProtectedApi(
  simAws: SimAws,
): Promise<SimCfnDeployedStack> {
  return await deployRestApi(
    simAws,
    simCfnRestApiTemplateFactory.make({
      handlerSource:
        "exports.handler = async () => ({ statusCode: 200, body: 'orders' });",
      methods: [
        { httpMethod: "GET", path: ["orders"] },
        { httpMethod: "GET", path: ["admin"] },
      ],
      resources: {
        OrdersAcl: webAclResource,
        OrdersAclAssociation: associationResource(stageArn),
      },
    }),
  );
}

/**
 * The deployed REST API, which is what a stage ARN has to be built from.
 */
function deployedRestApi(stack: SimCfnDeployedStack): SimRestApi {
  const restApi = stack.getResource("Api")?.simResource as
    | SimRestApi
    | undefined;

  assertNonNullable(restApi);

  return restApi;
}

/**
 * Request one path of the deployed API.
 */
async function request(
  simAws: SimAws,
  stack: SimCfnDeployedStack,
  path: string,
): Promise<Response> {
  const apiUrl = stack.outputs.get("ApiUrl")?.value;
  assertTypeString(apiUrl);

  return await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${apiUrl}${path}` }).toString(),
  );
}

/**
 * A template declaring a user pool with the web ACL in front of it.
 */
const userPoolTemplate = {
  Resources: {
    OrdersAcl: webAclResource,
    Pool: {
      Type: "AWS::Cognito::UserPool",
      Properties: { UserPoolName: "orders-pool" },
    },
    PoolAclAssociation: associationResource({
      "Fn::GetAtt": ["Pool", "Arn"],
    }),
  },
  Outputs: { PoolArn: { Value: { "Fn::GetAtt": ["Pool", "Arn"] } } },
};

describe("AWS::WAFv2::WebACLAssociation", () => {
  it("blocks a request to a stage the association put a web ACL in front of", async () => {
    // Given a deployed REST API with the web ACL associated to its stage.
    const simAws = simAwsInEuWest2();
    const stack = await deployProtectedApi(simAws);

    // When a request the web ACL blocks and one it allows are both made.
    const blocked = await request(simAws, stack, "admin");
    const allowed = await request(simAws, stack, "orders");

    // Then WAF answered the first and the integration answered the second, so
    // the association the template declared is the one the stage serves
    // behind.
    assertResponseStatus(blocked, 403, await describeResponse(blocked));
    assertStringIncludes(await blocked.text(), "Request blocked by AWS WAF");
    assertResponseStatus(allowed, 200, await describeResponse(allowed));
    assertIdentical(await allowed.text(), "orders");
  });

  it("disassociates when the stack comes down", async () => {
    // Given the deployed API and the stage ARN the association names.
    const simAws = simAwsInEuWest2();
    const stack = await deployProtectedApi(simAws);
    const association = stack.getResource("OrdersAclAssociation");

    assertNonNullable(association);

    const wafV2 = simAws.wafV2();
    const restApi = deployedRestApi(stack);

    assertTrue(wafV2.protection().protects(restApi.stageArn("prod")));

    // When the stack's Resources are torn down.
    await stack.teardown();

    // Then nothing is in front of the stage any more, which is what lets the
    // web ACL be deleted after it.
    assertFalse(wafV2.protection().protects(restApi.stageArn("prod")));
    assertIdentical(
      stack.getResource("OrdersAclAssociation")?.status,
      "DELETE_COMPLETE",
    );
  });

  it("puts a web ACL in front of a Cognito user pool", async () => {
    // Given a template associating the web ACL with a user pool.
    const simAws = simAwsInEuWest2();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "pool", template: userPoolTemplate });
    await stack.waitForDeployComplete();

    const poolArn = stack.outputs.get("PoolArn")?.value;
    assertTypeString(poolArn);

    // Then the pool is protected, and stays that way until the stack comes
    // down.
    assertTrue(simAws.wafV2().protection().protects(poolArn));

    await stack.teardown();

    assertFalse(simAws.wafV2().protection().protects(poolArn));
  });

  it("answers Ref with the pair of ARNs the association is", async () => {
    // Given a deployed association whose Ref is an output.
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnRestApiTemplateFactory.make({
        resources: {
          OrdersAcl: webAclResource,
          OrdersAclAssociation: associationResource(stageArn),
        },
        outputs: { AssociationRef: { Value: { Ref: "OrdersAclAssociation" } } },
      }),
    );
    const restApi = deployedRestApi(stack);
    const webAcl = simAws.wafV2().allWebAcls("REGIONAL")[0];

    assertNonNullable(webAcl);

    // Then it is the resource ARN and the web ACL ARN joined by a pipe. An
    // association has no identifier of its own on AWS either: what it is is
    // the pair.
    assertIdentical(
      stack.outputs.get("AssociationRef")?.value,
      `${restApi.stageArn("prod")}|${webAcl.arn}`,
    );
  });

  it("refuses an association naming a resource type AWS WAF does not protect", async () => {
    // Given a template pointing an association at an HTTP API stage, which
    // AWS WAF protects nothing of.
    const simAws = simAwsInEuWest2();
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "http-api",
        template: {
          Resources: {
            OrdersAcl: webAclResource,
            OrdersAclAssociation: associationResource({
              "Fn::Sub": httpApiStageArn,
            }),
          },
        },
      });
      await stack.waitForDeployComplete();
    });

    // Then the deployment failed with the reason WAFv2 gives an SDK caller,
    // under the logical id that asked for it.
    assertStringIncludes(
      error.message,
      "AWS::WAFv2::WebACLAssociation Resource OrdersAclAssociation",
    );
    assertStringIncludes(
      error.message,
      "AWS WAF does not protect an API Gateway HTTP API",
    );
  });

  it("refuses an association with no ResourceArn", async () => {
    // Given a template whose association names only the web ACL.
    const simAws = simAwsInEuWest2();
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "no-resource",
        template: {
          Resources: {
            OrdersAcl: webAclResource,
            OrdersAclAssociation: {
              Type: "AWS::WAFv2::WebACLAssociation",
              Properties: {
                WebACLArn: { "Fn::GetAtt": ["OrdersAcl", "Arn"] },
              },
            },
          },
        },
      });
      await stack.waitForDeployComplete();
    });

    // Then the refusal says which Resource could not be read.
    assertStringIncludes(
      error.message,
      "Invalid AWS::WAFv2::WebACLAssociation Resource OrdersAclAssociation: " +
        "ResourceArn is required",
    );
  });
});
