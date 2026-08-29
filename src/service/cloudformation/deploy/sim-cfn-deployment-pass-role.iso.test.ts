import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIamPolicyDocumentStatement } from "../../iam/policy/sim-iam-policy.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

/**
 * A Stack declaring a Role and a function that runs as it, which is the shape
 * a deployment hands a Role over in.
 */
const jobStackTemplate = {
  Resources: {
    JobRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "JobRole",
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "sts:AssumeRole",
            Principal: { Service: "lambda.amazonaws.com" },
          },
        },
      },
    },
    JobFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "job-function",
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Code: { ZipFile: "exports.handler = async () => {};" },
        Role: { "Fn::GetAtt": ["JobRole", "Arn"] },
      },
    },
  },
};

describe("a deployment handing a Role to the Resources it creates", () => {
  it("fails the function a deploy Role may not pass its Role to", async () => {
    // Given a deploy Role allowed everything except passing a Role, which is
    // one of the commoner ways a real deployment stops.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const deployer = await deployRole(simAws, accountId, "deployer", [
      { Effect: "Allow", Action: "*", Resource: "*" },
      { Effect: "Deny", Action: "iam:PassRole", Resource: "*" },
    ]);

    // When it deploys a Stack whose function names a Role.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "analytics-stack",
        template: jobStackTemplate,
        caller: deployer,
      });
    });

    // Then the function failed on the Role it was handed, naming the deploy
    // Role that was refused.
    assertStringIncludes(
      error.message,
      `arn:aws:iam::${accountId}:role/deployer is not authorized to ` +
        `perform: iam:PassRole on resource: ` +
        `arn:aws:iam::${accountId}:role/JobRole`,
    );

    const stack = simAws.cloudFormation().getStackByName("analytics-stack");
    assertNonNullable(stack);

    assertIdentical(stack.getResource("JobRole")?.status, "CREATE_COMPLETE");
    assertIdentical(stack.getResource("JobFunction")?.status, "CREATE_FAILED");
    assertUndefined(simAws.lambda().getSimFunctionByName("job-function"));
  });

  it("deploys as a Role allowed to pass a Role to Lambda", async () => {
    // Given a deploy Role whose PassRole statement is conditioned on the
    // service the Role goes to, as a CDK-generated one commonly is.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const deployer = await deployRole(simAws, accountId, "deployer", [
      { Effect: "Allow", Action: ["iam:*", "lambda:*"], Resource: "*" },
      {
        Effect: "Allow",
        Action: "iam:PassRole",
        Resource: "*",
        Condition: {
          StringEquals: { "iam:PassedToService": "lambda.amazonaws.com" },
        },
      },
    ]);

    // When it deploys the same Stack.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "analytics-stack",
      template: jobStackTemplate,
      caller: deployer,
    });

    // Then the condition matched and the function was created.
    assertIdentical(
      stack.getResource("JobFunction")?.status,
      "CREATE_COMPLETE",
    );

    await simAws.backgroundTasksComplete();
  });

  it("fails a state machine on the Role its Stack hands Step Functions", async () => {
    // Given a deploy Role allowed everything except passing a Role, and a
    // Stack declaring a Resource of another service that keeps one.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const deployer = await deployRole(simAws, accountId, "deployer", [
      { Effect: "Allow", Action: "*", Resource: "*" },
      { Effect: "Deny", Action: "iam:PassRole", Resource: "*" },
    ]);

    // When it deploys the Stack.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "enrolment-stack",
        template: {
          Resources: {
            Workflow: {
              Type: "AWS::StepFunctions::StateMachine",
              Properties: {
                StateMachineName: "Enrolment",
                RoleArn: `arn:aws:iam::${accountId}:role/WorkflowRole`,
                DefinitionString: JSON.stringify({
                  StartAt: "Done",
                  States: { Done: { Type: "Succeed" } },
                }),
              },
            },
          },
        },
        caller: deployer,
      });
    });

    // Then the same decision reached it, so the deployment stops wherever a
    // Role is handed over rather than at Lambda alone.
    assertStringIncludes(
      error.message,
      `iam:PassRole on resource: arn:aws:iam::${accountId}:role/WorkflowRole`,
    );
    assertUndefined(simAws.stepFunctions().findStateMachine("Enrolment"));
  });

  it("leaves a deployment naming no caller as it was", async () => {
    // Given a simulation with no deploy Role in it.
    const simAws = new SimAws({ defaultAccountId: makeSimAwsAccountId() });

    // When the same Stack is deployed without naming a principal.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "analytics-stack",
      template: jobStackTemplate,
    });

    // Then the root passed the Role, as it did before there was anything to
    // ask.
    assertIdentical(
      stack.getResource("JobFunction")?.status,
      "CREATE_COMPLETE",
    );

    await simAws.backgroundTasksComplete();
  });
});

/**
 * A Role a deployment can run as, carrying the statements it is given.
 */
async function deployRole(
  simAws: SimAws,
  accountId: SimAwsAccountId,
  roleName: string,
  statements: readonly SimIamPolicyDocumentStatement[],
): Promise<SimAwsCaller> {
  const iam = simAws.account(accountId).iam();

  await iam.createRole({
    input: {
      RoleName: roleName,
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
      RoleName: roleName,
      PolicyName: `${roleName}-policy`,
      PolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: statements,
      }),
    },
  });

  return { kind: "arn", arn: `arn:aws:iam::${accountId}:role/${roleName}` };
}
