import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { simCdkCloudAssemblyFactory } from "../cdk/sim-cdk-cloud-assembly.factory.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

/**
 * An inline policy widening the deploy Role to the service the Topic below
 * needs. Nothing in the template says it has to be created first.
 */
const widening = {
  Type: "AWS::IAM::Policy",
  Properties: {
    PolicyName: "DeployerSns",
    Roles: ["deployer"],
    PolicyDocument: {
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "sns:*", Resource: "*" },
    },
  },
};

const topic = {
  Type: "AWS::SNS::Topic",
  Properties: { TopicName: "alerts" },
};

const wideningFirst = { Widening: widening, Alerts: topic };
const topicFirst = { Alerts: topic, Widening: widening };

describe("the order a simulated CloudFormation deployment creates Resources in", () => {
  it("keeps the template's order when the deployment asks for nothing else", async () => {
    // Given a deploy Role a Stack widens to SNS before declaring a Topic.
    const { simAws, deployer } = await deployment();

    // When the Stack is deployed as it comes.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "alerts-stack",
      template: { Resources: wideningFirst },
      caller: deployer,
    });

    // Then the widening went first, as the template wrote it.
    assertIdentical(stack.getResource("Alerts")?.status, "CREATE_COMPLETE");
    assertNonNullable(simAws.sns().findTopic("alerts"));
  });

  it("fails the Stack the template's order was carrying when reversed", async () => {
    // Given the same Stack, whose only reason to deploy is the order it is
    // written in.
    const { simAws, deployer } = await deployment();

    // When it is deployed in the other order CloudFormation could pick.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "alerts-stack",
        template: { Resources: wideningFirst },
        caller: deployer,
        resourceOrder: "reversed",
      });
    });

    // Then the Topic was refused, because the widening had not landed yet.
    assertStringIncludes(error.message, "sns:CreateTopic");
  });

  it("fails the Stack in the template's order when the Topic is written first", async () => {
    // Given the same pair, declared the other way round.
    const { simAws, deployer } = await deployment();

    // When it is deployed as it comes.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "alerts-stack",
        template: { Resources: topicFirst },
        caller: deployer,
      });
    });

    // Then the Topic was refused, so the pair is caught in one of the two
    // orders whichever way the template declares it.
    assertStringIncludes(error.message, "sns:CreateTopic");
  });

  it("deploys the pair the option puts the widening in front of", async () => {
    // Given the same pair with the Topic written first.
    const { simAws, deployer } = await deployment();

    // When the reversed order puts the widening first.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "alerts-stack",
      template: { Resources: topicFirst },
      caller: deployer,
      resourceOrder: "reversed",
    });

    // Then it deploys, since reversing one order is the other one. The option
    // is the second order to run, not a second chance at the same one.
    assertIdentical(stack.getResource("Alerts")?.status, "CREATE_COMPLETE");
  });

  it("deploys a Stack whose ordering requirement DependsOn declares", async () => {
    // Given the pair with the requirement written down, in the order the
    // reversal would otherwise break.
    const { simAws, deployer } = await deployment();

    // When it is deployed reversed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "alerts-stack",
      template: {
        Resources: {
          Widening: widening,
          Alerts: { ...topic, DependsOn: "Widening" },
        },
      },
      caller: deployer,
      resourceOrder: "reversed",
    });

    // Then the edge held, so only Resources with nothing between them moved.
    assertIdentical(stack.getResource("Alerts")?.status, "CREATE_COMPLETE");
    assertNonNullable(simAws.sns().findTopic("alerts"));
  });

  it("reverses every Stack in a cloud assembly asked for the reversed order", async () => {
    // Given an assembly whose one Stack holds the pair, widening first.
    const { simAws, deployer } = await deployment();
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        {
          artifactId: "AlertsStack",
          regionName: "eu-west-2",
          resources: wideningFirst,
        },
      ],
    });

    // When the assembly is deployed reversed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployCdkOut({
        directoryPath: directory.join("cdk.out"),
        caller: deployer,
        resourceOrder: "reversed",
      });
    });

    // Then the Stack was deployed in the other order, and said so.
    assertStringIncludes(error.message, "sns:CreateTopic");
  });

  it("lets a Stack's own order override the assembly's", async () => {
    // Given the same assembly, deployed reversed.
    const { simAws, deployer } = await deployment();
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [
        {
          artifactId: "AlertsStack",
          regionName: "eu-west-2",
          resources: wideningFirst,
        },
      ],
    });

    // When the Stack names the template's own order for itself.
    await simAws.cloudFormation().deployCdkOut({
      directoryPath: directory.join("cdk.out"),
      caller: deployer,
      resourceOrder: "reversed",
      stackOptions: { AlertsStack: { resourceOrder: "template" } },
    });

    // Then it deployed the way its template is written.
    assertNonNullable(
      simAws
        .accountRegionScope(simAws.defaultAccountId, "eu-west-2")
        .sns()
        .findTopic("alerts"),
    );
  });
});

/**
 * A simulated AWS holding a deploy Role that may attach policies and may not
 * reach SNS, which is what the widening in the template above is for.
 */
async function deployment(): Promise<{
  readonly simAws: SimAws;
  readonly deployer: SimAwsCaller;
}> {
  const accountId = makeSimAwsAccountId();
  const simAws = new SimAws({
    defaultAccountId: accountId,
    defaultRegionName: "eu-west-2",
  });

  return { simAws, deployer: await deployRole(simAws, accountId) };
}

async function deployRole(
  simAws: SimAws,
  accountId: SimAwsAccountId,
): Promise<SimAwsCaller> {
  const iam = simAws.account(accountId).iam();

  await iam.createRole({
    input: {
      RoleName: "deployer",
      AssumeRolePolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Principal: { Service: "cloudformation.amazonaws.com" },
        },
      }),
    },
  });

  await iam.putRolePolicy({
    input: {
      RoleName: "deployer",
      PolicyName: "deployer-policy",
      PolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: { Effect: "Allow", Action: "iam:*", Resource: "*" },
      }),
    },
  });

  return { kind: "arn", arn: `arn:aws:iam::${accountId}:role/deployer` };
}
