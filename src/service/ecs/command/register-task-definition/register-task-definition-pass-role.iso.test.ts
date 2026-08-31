import {
  ListTaskDefinitionsCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayEmpty,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { SimEcsAccessDeniedException } from "../../error/sim-ecs.error.js";

const taskRoleArn = "arn:aws:iam::888888888888:role/CheckoutTaskRole";

const executionRoleArn = "arn:aws:iam::888888888888:role/CheckoutExecutionRole";

/**
 * A registration naming both of the Roles a task definition can carry.
 */
function registration(): ConstructorParameters<
  typeof RegisterTaskDefinitionCommand
>[0] {
  return {
    family: "checkout",
    containerDefinitions: [{ name: "app", image: "checkout:1" }],
    taskRoleArn,
    executionRoleArn,
  };
}

/**
 * A Role allowed to register task definitions and nothing else.
 */
async function registrarIn(simAws: SimAws): Promise<string> {
  const role = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "Registrar",
      policyName: "RegisterTaskDefinitions",
      actions: ["ecs:RegisterTaskDefinition"],
    },
    simAws,
  );

  return role.Arn;
}

describe("passing Roles to ECS RegisterTaskDefinition", () => {
  it("refuses a caller that may register and may not pass the task role", async () => {
    // Given a Role allowed to register task definitions and nothing else.
    const simAws = new SimAws();
    const registrar = await registrarIn(simAws);

    // When it registers a task definition naming both Roles.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .registerTaskDefinition(
          new RegisterTaskDefinitionCommand(registration()),
          {
            caller: { kind: "arn", arn: registrar },
          },
        ),
    );

    // Then ECS reports its own AccessDeniedException about the task role,
    // which is the first of the two the request hands over.
    assertInstanceOf(error, SimEcsAccessDeniedException);
    assertStringIncludes(error.message, "iam:PassRole");
    assertStringIncludes(error.message, taskRoleArn);
    assertStringIncludes(error.message, registrar);
    const listed = await simAws
      .ecs()
      .listTaskDefinitions(new ListTaskDefinitionsCommand({}));

    assertArrayEmpty(listed.taskDefinitionArns);
  });

  it("refuses a caller allowed only one of the two Roles", async () => {
    // Given a Role allowed the task role and not the execution role.
    const simAws = new SimAws();
    const registrar = await registrarIn(simAws);

    await simAws.iam().putRolePolicy({
      input: {
        RoleName: "Registrar",
        PolicyName: "PassTaskRole",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "iam:PassRole", Resource: taskRoleArn },
        }),
      },
    });

    // When it registers the same task definition.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .registerTaskDefinition(
          new RegisterTaskDefinitionCommand(registration()),
          {
            caller: { kind: "arn", arn: registrar },
          },
        ),
    );

    // Then the execution role is what stopped it. Each Role is its own
    // decision.
    assertStringIncludes(error.message, executionRoleArn);
  });

  it("registers for a caller allowed to pass both Roles to ECS", async () => {
    // Given a Role allowed to pass a Role to an ECS task.
    const simAws = new SimAws();
    const registrar = await registrarIn(simAws);

    await simAws.iam().putRolePolicy({
      input: {
        RoleName: "Registrar",
        PolicyName: "PassTaskRoles",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "iam:PassRole",
            Resource: "*",
            Condition: {
              StringEquals: {
                "iam:PassedToService": "ecs-tasks.amazonaws.com",
              },
            },
          },
        }),
      },
    });

    // When it registers the task definition.
    const registered = await simAws
      .ecs()
      .registerTaskDefinition(
        new RegisterTaskDefinitionCommand(registration()),
        {
          caller: { kind: "arn", arn: registrar },
        },
      );

    // Then the condition matched and the revision carries both Roles.
    assertIdentical(registered.taskDefinition?.taskRoleArn, taskRoleArn);
    assertIdentical(
      registered.taskDefinition.executionRoleArn,
      executionRoleArn,
    );
  });
});
