import {
  assertArrayEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimIamRoleName } from "../role/sim-iam-role.js";
import type { SimIamUsername } from "../user/sim-iam-user.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Principal: { Service: "lambda.amazonaws.com" },
    Action: "sts:AssumeRole",
  },
};

describe("IAM CloudFormation Tags", () => {
  it("tags the Role and the User a template declares", async () => {
    // Given a template tagging a Role and a User, the way CDK's Tags.of does
    const simAws = new SimAws();
    const tags = [
      { Key: "team", Value: "orders" },
      { Key: "stage", Value: "prod" },
    ];

    // When it is deployed
    await simAws.cloudFormation().deployTemplate({
      stackName: "tagged-iam-stack",
      template: {
        Resources: {
          OrdersRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: "OrdersRole",
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
              Tags: tags,
            },
          },
          OrdersUser: {
            Type: "AWS::IAM::User",
            Properties: { UserName: "orders-operator", Tags: tags },
          },
        },
      },
    });

    // Then both carry the tags
    const iam = simAws.iam();
    const describe = (
      entity:
        | { tags: { all: readonly { Key: string; Value: string }[] } }
        | undefined,
    ): string[] =>
      entity?.tags.all.map((tag) => `${tag.Key}=${tag.Value}`) ?? [];

    assertArrayEquals(describe(iam.roles.get("OrdersRole" as SimIamRoleName)), [
      "team=orders",
      "stage=prod",
    ]);
    assertArrayEquals(
      describe(iam.users.get("orders-operator" as SimIamUsername)),
      ["team=orders", "stage=prod"],
    );
  });

  it("fails a Role whose Tags are not a list of tags", async () => {
    // Given a template giving a Role a Tags map
    const simAws = new SimAws();

    // When it is deployed
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "badly-tagged-stack",
        template: {
          Resources: {
            OrdersRole: {
              Type: "AWS::IAM::Role",
              Properties: {
                AssumeRolePolicyDocument: assumeRolePolicyDocument,
                Tags: { team: "orders" },
              },
            },
          },
        },
      });
    });

    // Then the Resource fails, naming the property
    assertStringIncludes(error.message, "Tags must be a list of tags");
  });
});
