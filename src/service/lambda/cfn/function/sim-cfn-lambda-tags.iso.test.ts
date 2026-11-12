import { GetFunctionCommand, ListTagsCommand } from "@aws-sdk/client-lambda";
import { assertNonNullable, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Deploy a single AWS::Lambda::Function carrying the given Tags property.
 */
async function deployTagged(
  simAws: SimAws,
  tags: SimCfnTemplateValue,
): Promise<void> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: {
      Resources: {
        OrdersFunction: {
          Type: "AWS::Lambda::Function",
          Properties: {
            FunctionName: "orders",
            Role: "arn:aws:iam::111111111111:role/OrdersRole",
            Handler: "index.handler",
            Runtime: "nodejs22.x",
            Code: { ZipFile: "exports.handler = async () => null;" },
            Tags: tags,
          },
        },
      },
    },
  });
  await stack.waitForDeployComplete();
}

describe("Lambda CloudFormation Function tags", () => {
  it("creates the function with the Key and Value pairs a template lists", async () => {
    // Given a template tagging its function, as CDK's Tags.of synthesises.
    const simAws = new SimAws();
    await deployTagged(simAws, [
      { Key: "team", Value: "payments" },
      { Key: "cost-centre", Value: 1234 },
    ]);

    // When the deployed function's tags are read.
    const read = await simAws
      .lambda()
      .getFunction(new GetFunctionCommand({ FunctionName: "orders" }));
    assertNonNullable(read.Configuration.FunctionArn);
    const listed = await simAws
      .lambda()
      .listTags(
        new ListTagsCommand({ Resource: read.Configuration.FunctionArn }),
      );

    // Then each pair is a tag, with a number read as its string.
    assertObjectEquals(listed.Tags, {
      team: "payments",
      "cost-centre": "1234",
    });
  });

  it("drops an entry that is not a Key and Value pair rather than failing the stack", async () => {
    const simAws = new SimAws();
    await deployTagged(simAws, [
      { Key: "team", Value: "payments" },
      { Key: "nested", Value: { not: "a string" } },
      "not a pair",
    ]);

    const read = await simAws
      .lambda()
      .getFunction(new GetFunctionCommand({ FunctionName: "orders" }));

    assertObjectEquals(read.Tags, { team: "payments" });
  });
});
