import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";
import { simCdkCrossRegionParameterTemplateFactory } from "./sim-cdk-cross-region-parameter-template.factory.js";

const edgeFunctionArn =
  "arn:aws:lambda:us-east-1:111111111111:function:site-edge-fn:1";
const parameterName = "/cdk/EdgeFunctionArn/eu-west-1/SiteStack/EdgeFn";

/**
 * Write the parameter an EdgeFunction's support Stack writes, in the Region
 * that Stack deploys into.
 */
async function writeSupportStackParameter(
  simAws: SimAws,
  value: string,
): Promise<void> {
  await simAws
    .accountRegionScope(undefined, "us-east-1")
    .ssm()
    .putParameter({
      input: { Name: parameterName, Type: "String", Value: value },
    });
}

/**
 * Deploy the reader template into the Region the using Stack lives in, which
 * is not the Region the parameter was written in.
 */
async function deployUsingStack(
  simAws: SimAws,
  template: CfnTemplateBodyRecord,
): ReturnType<ReturnType<SimAws["cloudFormation"]>["deployTemplate"]> {
  return await simAws
    .region("eu-west-1")
    .cloudFormation()
    .deployTemplate({ stackName: "site-stack", template });
}

describe("CDK cross-Region parameter reader CloudFormation Resource [iso]", () => {
  it("reads the parameter the support Stack wrote in another Region", async () => {
    // Given a simulated SSM parameter holding an edge function's version ARN,
    // written in us-east-1 as an EdgeFunction's support Stack writes it.
    const simAws = new SimAws();
    await writeSupportStackParameter(simAws, edgeFunctionArn);

    // When a Stack in eu-west-1 deploys the reader CDK synthesizes for it.
    const stack = await deployUsingStack(
      simAws,
      simCdkCrossRegionParameterTemplateFactory.make(),
    );

    await stack.waitForDeployComplete();

    // Then the Fn::GetAtt on the reader answers with the ARN the parameter
    // holds, rather than with a stand-in for a value that never arrived.
    assertIdentical(stack.output("EdgeFunctionArn"), edgeFunctionArn);
  });

  it("reads nothing and says so when no Stack has written the parameter", async () => {
    // Given nothing has written the parameter, which is what deploying the
    // using Stack's template on its own leaves behind.
    const simAws = new SimAws();

    // When the reader is deployed anyway.
    const stack = await deployUsingStack(
      simAws,
      simCdkCrossRegionParameterTemplateFactory.make(),
    );

    await stack.waitForDeployComplete();

    // Then the Stack deploys, and the attribute answers with the stand-in an
    // unanswerable Fn::GetAtt resolves to.
    assertIdentical(stack.output("EdgeFunctionArn"), "ArnReader.FunctionArn");

    // And the read that did not happen is recorded with what to do about it.
    const [ignored] = stack.ignoredProperties;

    assertNonNullable(ignored);
    assertIdentical(ignored.path, "ParameterName");
    assertStringIncludes(
      ignored.reason,
      `no simulated SSM parameter ${parameterName} has been written in us-east-1`,
    );
  });

  it("refuses a property this simulation has not been told about", async () => {
    // Given a reader carrying a property CDK does not emit.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await deployUsingStack(
        simAws,
        simCdkCrossRegionParameterTemplateFactory.make({
          readerProperties: { WithDecryption: true },
        }),
      );
    });

    // Then the Stack fails naming the property, rather than reading the
    // parameter as though the property had not been asked for.
    assertStringIncludes(
      error.message,
      "Invalid Custom::CrossRegionStringParameterReader Resource ArnReader: " +
        "WithDecryption is not a Custom::CrossRegionStringParameterReader " +
        "property this simulation knows about",
    );
  });

  it("refuses a Region that is not an AWS Region", async () => {
    // Given a reader naming a Region no parameter could be written in.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await deployUsingStack(
        simAws,
        simCdkCrossRegionParameterTemplateFactory.make({
          regionName: "us-east-9",
        }),
      );
    });

    // Then the Stack fails on the Region.
    assertStringIncludes(
      error.message,
      'Region must resolve to a known AWS Region, and "us-east-9" is not one',
    );
  });

  it("refuses an attribute CDK's provider function does not answer", async () => {
    // Given a parameter to read, and a template reading an attribute off the
    // reader that its provider function never returns.
    const simAws = new SimAws();
    await writeSupportStackParameter(simAws, edgeFunctionArn);

    // When the Stack is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await deployUsingStack(
        simAws,
        simCdkCrossRegionParameterTemplateFactory.make({
          attributeName: "ParameterValue",
        }),
      );

      await stack.waitForDeployComplete();
    });

    // Then the Stack fails on the attribute, rather than resolving it to
    // something nothing put there.
    assertStringIncludes(
      error.message,
      "Unsupported Custom::CrossRegionStringParameterReader attribute " +
        "ParameterValue",
    );
  });
});
