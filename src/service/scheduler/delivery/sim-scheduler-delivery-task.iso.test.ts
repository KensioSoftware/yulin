import { RegisterTaskDefinitionCommand } from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateScheduleCommand,
  GetScheduleCommand,
  type Target,
} from "@aws-sdk/client-scheduler";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simEcsClusterFactory } from "../../ecs/cluster/sim-ecs-cluster.factory.js";
import {
  SimSchedulerUnsimulatedInputException,
  SimSchedulerValidationException,
} from "../error/sim-scheduler.error.js";

const startedAt = "2026-07-26T09:00:00.000Z";

const clusterArn = "arn:aws:ecs:us-east-1:888888888888:cluster/default";

const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

/**
 * A simulation with a cluster, and a role that trusts Scheduler and is allowed
 * exactly what one policy statement says.
 */
async function simulationWithRole(statement: object): Promise<SimAws> {
  const simAws = new SimAws({ clock: new SimFixedClock(new Date(startedAt)) });

  await simEcsClusterFactory.make({}, simAws);

  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "SchedulerRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "scheduler.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "SchedulerRole",
      PolicyName: "RunTasks",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return simAws;
}

/**
 * A simulation whose execution role may run any task.
 */
async function simulationAllowedToRunTasks(): Promise<SimAws> {
  return await simulationWithRole({
    Effect: "Allow",
    Action: "ecs:RunTask",
    Resource: "*",
  });
}

/**
 * A task definition of one container, bound to the handler given.
 */
async function boundTaskDefinition(
  simAws: SimAws,
  run: () => void,
): Promise<void> {
  simAws.ecs().bindContainer({
    family: "nightly-import",
    containerName: "app",
    run,
  });

  await simAws.ecs().registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family: "nightly-import",
      containerDefinitions: [{ name: "app", image: "nightly-import:1" }],
    }),
  );
}

/**
 * A one-time schedule an hour out, advanced past so it fires exactly once.
 */
async function scheduleFor(simAws: SimAws, target: Target): Promise<void> {
  await simAws.scheduler().createSchedule(
    new CreateScheduleCommand({
      Name: "nightly-import",
      ScheduleExpression: "at(2026-07-26T10:00:00)",
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: target,
    }),
  );

  await simAws.clock().advanceBy({ hours: 2 });
}

/**
 * The target of a schedule that runs the nightly import.
 */
function importTarget(overrides: Partial<Target> = {}): Target {
  return {
    Arn: clusterArn,
    RoleArn: roleArn,
    EcsParameters: { TaskDefinitionArn: "nightly-import" },
    ...overrides,
  };
}

describe("Scheduler ECS target", () => {
  it("runs the task when simulated time reaches the schedule", async () => {
    // Given a schedule whose target runs a task definition with a bound
    // container.
    const simAws = await simulationAllowedToRunTasks();
    let runs = 0;

    await boundTaskDefinition(simAws, () => {
      runs += 1;
    });

    // When simulated time reaches the schedule.
    await scheduleFor(simAws, importTarget());

    // Then the container ran, and the task is in ECS's own state. Nothing ran
    // on the host's clock: only advancing the simulation's fired it.
    assertIdentical(runs, 1);

    const tasks = await simAws
      .ecs()
      .listTasks({ input: { desiredStatus: "STOPPED" } });

    assertArrayLength(tasks.taskArns ?? [], 1);
    assertArrayEmpty(simAws.scheduler().deliveryFailures);
  });

  it("puts the target's container overrides in the container", async () => {
    // Given a target whose Input overrides the container's environment.
    const simAws = await simulationAllowedToRunTasks();
    let reportedFor = "";

    await boundTaskDefinition(simAws, () => {
      reportedFor = process.env["REPORT_DATE"] ?? "";
    });

    // When the schedule fires.
    await scheduleFor(
      simAws,
      importTarget({
        Input: JSON.stringify({
          containerOverrides: [
            {
              name: "app",
              environment: [{ name: "REPORT_DATE", value: "today" }],
            },
          ],
        }),
      }),
    );

    // Then the override reached the container, which is what an ECS target's
    // Input is for: a task has nowhere to receive a payload.
    assertIdentical(reportedFor, "today");
  });

  it("runs the number of tasks the target asked for", async () => {
    const simAws = await simulationAllowedToRunTasks();

    await boundTaskDefinition(simAws, () => {
      //
    });

    await scheduleFor(
      simAws,
      importTarget({
        EcsParameters: { TaskDefinitionArn: "nightly-import", TaskCount: 3 },
      }),
    );

    const tasks = await simAws
      .ecs()
      .listTasks({ input: { desiredStatus: "STOPPED" } });

    assertArrayLength(tasks.taskArns ?? [], 3);
  });

  it("does not run the task when the role may not, and says why", async () => {
    // Given an execution role allowed to run something else.
    const simAws = await simulationWithRole({
      Effect: "Allow",
      Action: "ecs:RunTask",
      Resource: "arn:aws:ecs:us-east-1:888888888888:task-definition/other:1",
    });
    let runs = 0;

    await boundTaskDefinition(simAws, () => {
      runs += 1;
    });

    // When the schedule fires.
    await scheduleFor(simAws, importTarget());

    // Then nothing ran, and the failure names the role and the action, since
    // that is where it is fixed.
    assertIdentical(runs, 0);

    const [failure] = simAws.scheduler().deliveryFailures;

    assertNonNullable(failure);
    assertIdentical(failure.roleArn, roleArn);
    assertStringIncludes(failure.message, "ecs:RunTask");
    assertIdentical(failure.at.toISOString(), "2026-07-26T10:00:00.000Z");
  });

  it("records that no container ran rather than failing the schedule", async () => {
    // Given a task definition whose container is bound to nothing.
    const simAws = await simulationAllowedToRunTasks();

    await simAws.ecs().registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "nightly-import",
        containerDefinitions: [{ name: "app", image: "nightly-import:1" }],
      }),
    );

    // When the schedule fires.
    await scheduleFor(simAws, importTarget());

    // Then the schedule invoked without failing, and the task says nothing
    // started, which is what makes a binding that matches nothing visible.
    assertArrayEmpty(simAws.scheduler().deliveryFailures);

    const tasks = await simAws
      .ecs()
      .listTasks({ input: { desiredStatus: "STOPPED" } });
    const described = await simAws
      .ecs()
      .describeTasks({ input: { tasks: [...(tasks.taskArns ?? [])] } });

    assertIdentical(described.tasks?.[0]?.stopCode, "TaskFailedToStart");
  });

  it("reports what the schedule's target runs", async () => {
    // Given a schedule that runs a task.
    const simAws = await simulationAllowedToRunTasks();

    await simAws.scheduler().createSchedule(
      new CreateScheduleCommand({
        Name: "nightly-import",
        ScheduleExpression: "rate(1 day)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: importTarget(),
      }),
    );

    // When it is described.
    const described = await simAws
      .scheduler()
      .getSchedule(new GetScheduleCommand({ Name: "nightly-import" }));

    // Then the parameters come back as they were written.
    assertIdentical(
      described.Target?.EcsParameters?.TaskDefinitionArn,
      "nightly-import",
    );
  });

  it("refuses an Input that is not JSON on a target that runs a task", async () => {
    // Given a schedule target whose Input is the plain text Scheduler takes
    // for its other target types.
    const simAws = await simulationAllowedToRunTasks();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.scheduler().createSchedule(
        new CreateScheduleCommand({
          Name: "nightly-import",
          ScheduleExpression: "rate(1 day)",
          FlexibleTimeWindow: { Mode: "OFF" },
          Target: importTarget({ Input: "run it" }),
        }),
      );
    });

    // Then it is refused where it was written, rather than failing every
    // invocation an hour of simulated time later.
    assertInstanceOf(error, SimSchedulerValidationException);
    assertStringIncludes(error.message, "is not JSON");
  });

  it("refuses EcsParameters on a target that runs no task", async () => {
    const simAws = await simulationAllowedToRunTasks();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.scheduler().createSchedule(
        new CreateScheduleCommand({
          Name: "nightly-import",
          ScheduleExpression: "rate(1 day)",
          FlexibleTimeWindow: { Mode: "OFF" },
          Target: {
            Arn: "arn:aws:sqs:us-east-1:888888888888:reports",
            RoleArn: roleArn,
            EcsParameters: { TaskDefinitionArn: "nightly-import" },
          },
        }),
      );
    });

    assertInstanceOf(error, SimSchedulerUnsimulatedInputException);
    assertStringIncludes(error.message, "names an ECS cluster");
  });

  it("refuses an ECS ARN that names no cluster", async () => {
    // Given a task definition ARN and a task ARN, which are both well formed
    // ECS ARNs and neither of which names a cluster. The second reads as one
    // for as long as nothing looks past the name, since a task's resource
    // starts `task/<cluster>/`.
    const arns = [
      "arn:aws:ecs:us-east-1:888888888888:task-definition/x:1",
      "arn:aws:ecs:us-east-1:888888888888:task/default/2f1c",
    ];

    for (const Arn of arns) {
      // oxlint-disable-next-line no-await-in-loop
      const simAws = await simulationAllowedToRunTasks();
      // oxlint-disable-next-line no-await-in-loop
      const error = await assertThrowsErrorAsync(async () => {
        await simAws.scheduler().createSchedule(
          new CreateScheduleCommand({
            Name: "nightly-import",
            ScheduleExpression: "rate(1 day)",
            FlexibleTimeWindow: { Mode: "OFF" },
            Target: importTarget({ Arn }),
          }),
        );
      });

      // Then each is refused when the schedule is created.
      assertInstanceOf(error, SimSchedulerValidationException);
      assertStringIncludes(error.message, "names no cluster");
    }
  });
});
