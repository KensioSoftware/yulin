# Simulated AWS Backup

Yulin simulates AWS Backup vaults, plans, selections, jobs and recovery points. Import Backup types
from `@kensio/yulin/backup`.

## Creating a vault, plan and selection

Use `simAws.backup()` for the default account and Region. Each plan rule names an existing vault. A
selection assigns resource ARNs to a plan.

```typescript sim-backup-create-plan-selection
/**
 * Creating a daily backup plan for one DynamoDB table.
 */

import {
  CreateBackupPlanCommand,
  CreateBackupSelectionCommand,
  CreateBackupVaultCommand,
  GetBackupPlanCommand,
  GetBackupSelectionCommand,
} from "@aws-sdk/client-backup";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const backup = simAws.backup();

await backup.createBackupVault(
  new CreateBackupVaultCommand({
    BackupVaultName: "application-backups",
  }),
);

const createdPlan = await backup.createBackupPlan(
  new CreateBackupPlanCommand({
    BackupPlan: {
      BackupPlanName: "application-plan",
      Rules: [
        {
          RuleName: "daily",
          TargetBackupVaultName: "application-backups",
          ScheduleExpression: "cron(0 1 ? * * *)",
          Lifecycle: { DeleteAfterDays: 35 },
        },
      ],
    },
  }),
);
assertNonNullable(createdPlan.BackupPlanId);

const createdSelection = await backup.createBackupSelection(
  new CreateBackupSelectionCommand({
    BackupPlanId: createdPlan.BackupPlanId,
    BackupSelection: {
      SelectionName: "orders",
      IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
      Resources: ["arn:aws:dynamodb:us-east-1:888888888888:table/orders"],
    },
  }),
);
assertNonNullable(createdSelection.SelectionId);

const plan = await backup.getBackupPlan(
  new GetBackupPlanCommand({ BackupPlanId: createdPlan.BackupPlanId }),
);
console.log(plan.BackupPlan?.Rules?.[0]?.ScheduleExpression);
// "cron(0 1 ? * * *)"

const selection = await backup.getBackupSelection(
  new GetBackupSelectionCommand({
    BackupPlanId: createdPlan.BackupPlanId,
    SelectionId: createdSelection.SelectionId,
  }),
);
console.log(selection.BackupSelection?.Resources);
// ["arn:aws:dynamodb:us-east-1:888888888888:table/orders"]
```

A plan needs at least one named rule and target vault. The default schedule is
`cron(0 5 ? * * *)`. Yulin accepts six-field AWS cron expressions and rate expressions. It rejects
`at(...)` expressions.

When both lifecycle values are set, `DeleteAfterDays` must be at least 90 days after
`MoveToColdStorageAfterDays`. Use `-1` for both values to keep recovery points indefinitely.

## Running scheduled backups

Plan rules run on the simulated clock. A due rule creates one completed job and recovery point for
each distinct resource ARN in its selections.

```typescript sim-backup-run-schedule
/**
 * Advancing a plan through its next scheduled backup.
 */

import {
  CreateBackupPlanCommand,
  CreateBackupSelectionCommand,
  CreateBackupVaultCommand,
  ListBackupJobsCommand,
  ListRecoveryPointsByBackupVaultCommand,
} from "@aws-sdk/client-backup";
import { assertArrayLength, assertNonNullable } from "@kensio/smartass";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-08-31T09:30:00.000Z")),
});
const backup = simAws.backup();

await backup.createBackupVault(
  new CreateBackupVaultCommand({ BackupVaultName: "application-backups" }),
);
const createdPlan = await backup.createBackupPlan(
  new CreateBackupPlanCommand({
    BackupPlan: {
      BackupPlanName: "application-plan",
      Rules: [
        {
          RuleName: "hourly",
          TargetBackupVaultName: "application-backups",
          ScheduleExpression: "rate(1 hour)",
          Lifecycle: { DeleteAfterDays: 35 },
        },
      ],
    },
  }),
);
assertNonNullable(createdPlan.BackupPlanId);
await backup.createBackupSelection(
  new CreateBackupSelectionCommand({
    BackupPlanId: createdPlan.BackupPlanId,
    BackupSelection: {
      SelectionName: "orders",
      IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
      Resources: ["arn:aws:dynamodb:us-east-1:888888888888:table/orders"],
    },
  }),
);

await simAws.clock().advanceBy({ hours: 1 });

const stored = backup.vault("application-backups").recoveryPoints();
assertArrayLength(stored, 1);
console.log(stored[0].creationDate.toISOString());
// "2026-08-31T10:30:00.000Z"

const points = await backup.listRecoveryPointsByBackupVault(
  new ListRecoveryPointsByBackupVaultCommand({
    BackupVaultName: "application-backups",
  }),
);
const jobs = await backup.listBackupJobs(new ListBackupJobsCommand({}));
console.log(points.RecoveryPoints?.[0]?.ResourceArn);
// "arn:aws:dynamodb:us-east-1:888888888888:table/orders"
console.log(jobs.BackupJobs?.[0]?.State); // "COMPLETED"
```

`DeleteAfterDays` removes a recovery point when simulated time reaches its expiry. Recovery point
reads apply expiry before returning.

Vault Lock bounds are checked when a backup starts. An invalid lifecycle produces a `FAILED` job and
no recovery point. Read the reason from the job's `StatusMessage`.

## Starting an on-demand backup

`StartBackupJob` completes at the current simulated time. It applies the same lifecycle and Vault
Lock checks as a scheduled job.

```typescript sim-backup-start-job
/**
 * Creating an on-demand recovery point.
 */

import {
  CreateBackupVaultCommand,
  DescribeRecoveryPointCommand,
  StartBackupJobCommand,
} from "@aws-sdk/client-backup";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-08-31T12:00:00.000Z")),
});
const backup = simAws.backup();
await backup.createBackupVault(
  new CreateBackupVaultCommand({ BackupVaultName: "manual-backups" }),
);

const started = await backup.startBackupJob(
  new StartBackupJobCommand({
    BackupVaultName: "manual-backups",
    ResourceArn: "arn:aws:s3:::application-files",
    IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
    Lifecycle: { DeleteAfterDays: 14 },
  }),
);
assertNonNullable(started.RecoveryPointArn);

const point = await backup.describeRecoveryPoint(
  new DescribeRecoveryPointCommand({
    BackupVaultName: "manual-backups",
    RecoveryPointArn: started.RecoveryPointArn,
  }),
);
console.log(point.CreationDate?.toISOString());
// "2026-08-31T12:00:00.000Z"
```

## Vault Lock

`PutBackupVaultLockConfiguration` sets minimum and maximum retention. `ChangeableForDays` adds a
grace period. The configuration becomes immutable when that period ends.

```typescript sim-backup-vault-lock
/**
 * Advancing a compliance lock through its grace period.
 */

import {
  CreateBackupVaultCommand,
  DescribeBackupVaultCommand,
  PutBackupVaultLockConfigurationCommand,
} from "@aws-sdk/client-backup";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-08-30T10:00:00.000Z")),
});
const backup = simAws.backup();

await backup.createBackupVault(
  new CreateBackupVaultCommand({ BackupVaultName: "compliance-backups" }),
);

await backup.putBackupVaultLockConfiguration(
  new PutBackupVaultLockConfigurationCommand({
    BackupVaultName: "compliance-backups",
    ChangeableForDays: 3,
    MinRetentionDays: 7,
    MaxRetentionDays: 365,
  }),
);

const changeable = await backup.describeBackupVault(
  new DescribeBackupVaultCommand({
    BackupVaultName: "compliance-backups",
  }),
);
console.log(changeable.LockDate?.toISOString());
// "2026-09-02T10:00:00.000Z"

await simAws.clock().advanceBy({ days: 3 });

try {
  await backup.putBackupVaultLockConfiguration(
    new PutBackupVaultLockConfigurationCommand({
      BackupVaultName: "compliance-backups",
      MinRetentionDays: 14,
    }),
  );
} catch (error) {
  console.log(error instanceof Error ? error.name : "unknown error");
  // "InvalidParameterValueException"
}
```

`ChangeableForDays` must be between 3 and 36,500. Retention periods are whole days. A minimum cannot
exceed the maximum, and the maximum cannot exceed 36,500 days. A lock without
`ChangeableForDays` remains changeable.

## Deploying from CloudFormation

Simulated CloudFormation deploys `AWS::Backup::BackupVault`, `AWS::Backup::BackupPlan` and
`AWS::Backup::BackupSelection`.

```typescript sim-backup-cloudformation
/**
 * Deploying a vault, plan and selection from one template.
 */

import { GetBackupSelectionCommand } from "@aws-sdk/client-backup";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "backup-stack",
  template: {
    Resources: {
      Vault: {
        Type: "AWS::Backup::BackupVault",
        Properties: {
          BackupVaultName: "application-backups",
          LockConfiguration: {
            MinRetentionDays: 7,
            MaxRetentionDays: 365,
          },
        },
      },
      Plan: {
        Type: "AWS::Backup::BackupPlan",
        Properties: {
          BackupPlan: {
            BackupPlanName: "application-plan",
            BackupPlanRule: [
              {
                RuleName: "daily",
                TargetBackupVault: { Ref: "Vault" },
                ScheduleExpression: "cron(0 1 ? * * *)",
                Lifecycle: { DeleteAfterDays: 35 },
              },
            ],
          },
        },
      },
      Selection: {
        Type: "AWS::Backup::BackupSelection",
        Properties: {
          BackupPlanId: { Ref: "Plan" },
          BackupSelection: {
            SelectionName: "orders",
            IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
            Resources: ["arn:aws:dynamodb:us-east-1:888888888888:table/orders"],
          },
        },
      },
    },
    Outputs: {
      VaultArn: {
        Value: { "Fn::GetAtt": ["Vault", "BackupVaultArn"] },
      },
      PlanId: { Value: { Ref: "Plan" } },
      SelectionId: { Value: { Ref: "Selection" } },
    },
  },
});

await stack.waitForDeployComplete();

const selection = await simAws.backup().getBackupSelection(
  new GetBackupSelectionCommand({
    BackupPlanId: stack.output("PlanId"),
    SelectionId: stack.output("SelectionId"),
  }),
);

console.log(stack.output("VaultArn"));
// "arn:aws:backup:us-east-1:888888888888:backup-vault:application-backups"
console.log(selection.BackupSelection?.SelectionName); // "orders"
```

`Ref` and `Fn::GetAtt` return these values:

- `AWS::Backup::BackupVault` returns the vault name from `Ref`. `BackupVaultArn` and
  `BackupVaultName` are available through `Fn::GetAtt`.
- `AWS::Backup::BackupPlan` returns the plan ID from `Ref`. `BackupPlanArn`, `BackupPlanId` and
  `VersionId` are available through `Fn::GetAtt`.
- `AWS::Backup::BackupSelection` returns the selection ID from `Ref`. `Id`, `SelectionId` and
  `BackupPlanId` are available through `Fn::GetAtt`.

Stack teardown removes all three resource types from the simulation.

## Permissions

Every supported operation uses simulated IAM. Vault operations authorize against the vault ARN.
Plan and selection operations use the plan ARN. `DescribeRecoveryPoint` uses the recovery point ARN.
List and backup job read operations that name no resource use `*`.

```typescript sim-backup-iam-policy
/**
 * A Role allowed to create one named backup vault.
 */

import { CreateBackupVaultCommand } from "@aws-sdk/client-backup";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const role = await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "BackupAdministrator",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::888888888888:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "BackupAdministrator",
    PolicyName: "CreateApplicationVault",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "backup:CreateBackupVault",
        Resource:
          "arn:aws:backup:us-east-1:888888888888:backup-vault:application-backups",
      },
    }),
  }),
);

const created = await simAws.backup().createBackupVault(
  new CreateBackupVaultCommand({
    BackupVaultName: "application-backups",
  }),
  { caller: { kind: "arn", arn: role.Role.Arn } },
);

console.log(created.BackupVaultName); // "application-backups"
```

Authorization runs before resource lookup. An unauthorized request for a missing resource raises
`AccessDeniedException`.

## SDK interception

Intercept a `BackupClient` instance or the client class to route SDK commands to Yulin.

```typescript sim-backup-sdk-interception
/**
 * Routing an AWS Backup client into the simulation.
 */

import {
  BackupClient,
  CreateBackupVaultCommand,
  ListBackupVaultsCommand,
} from "@aws-sdk/client-backup";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();
const client = new BackupClient({ region: "us-east-1" });
simSdk.intercept(client);

await client.send(
  new CreateBackupVaultCommand({ BackupVaultName: "application-backups" }),
);

const listed = await client.send(new ListBackupVaultsCommand({}));
console.log(listed.BackupVaultList?.[0]?.BackupVaultName);
// "application-backups"
```

Client Region and credentials select the simulated scope and caller. See
[SDK interception](https://yulinsim.dev/sdk/) for details.

## Account and Region scoping

Backup state is scoped by account and Region. The same vault name can exist in another scope.

```typescript sim-backup-account-region-scoping
/**
 * Keeping backup vaults inside their account and Region.
 */

import {
  CreateBackupVaultCommand,
  ListBackupVaultsCommand,
} from "@aws-sdk/client-backup";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .account("111111111111")
  .region("eu-west-2")
  .backup()
  .createBackupVault(
    new CreateBackupVaultCommand({ BackupVaultName: "application-backups" }),
  );

const inLondon = await simAws
  .account("111111111111")
  .region("eu-west-2")
  .backup()
  .listBackupVaults(new ListBackupVaultsCommand({}));

const inVirginia = await simAws
  .account("111111111111")
  .region("us-east-1")
  .backup()
  .listBackupVaults(new ListBackupVaultsCommand({}));

console.log(inLondon.BackupVaultList?.length); // 1
console.log(inVirginia.BackupVaultList?.length); // 0
```

## Available functionality

- `CreateBackupVault`, `DescribeBackupVault`, `DeleteBackupVault` and `ListBackupVaults`.
- `PutBackupVaultLockConfiguration`, including compliance lock grace periods driven by simulated
  time.
- `CreateBackupPlan` and `GetBackupPlan`, with rule schedule and lifecycle validation.
- `CreateBackupSelection`, `GetBackupSelection` and `ListBackupSelections`.
- Scheduled backup jobs driven by `simAws.clock()` and the plan rule schedule.
- `StartBackupJob`, `ListBackupJobs` and `DescribeBackupJob`.
- `ListRecoveryPointsByBackupVault`, `DescribeRecoveryPoint` and
  `simAws.backup().vault(name).recoveryPoints()`.
- Recovery point expiry from `DeleteAfterDays` and Vault Lock retention checks.
- IAM authorization for every supported command.
- SDK interception of `BackupClient`.
- Account and Region scoped state, ARNs and timestamps.
- `AWS::Backup::BackupVault`, `AWS::Backup::BackupPlan` and `AWS::Backup::BackupSelection` through
  simulated CloudFormation.

## Limitations

- Recovery point copies and restores are outside the simulation.
- Backup jobs complete immediately at their scheduled or requested simulated instant. Start and
  completion windows are accepted by the SDK types and ignored by the simulation.
- Cold-storage lifecycle values are recorded. Recovery points stay in one storage state.
- Overlapping plan rules are evaluated independently. AWS Backup's overlapping-window optimisation
  is outside the simulation.
- Vault deletion removes the vault and its recovery points.
- A selection stores its `Resources`. `Conditions`, `ListOfTags` and wildcard resource matching are
  outside the selection model.
- The selection's `IamRoleArn` is stored. No backup job assumes it, and creating a selection does
  no `iam:PassRole` check.
- `EncryptionKeyArn` is stored on a vault. KMS calls and recovery point encryption are outside the
  simulation.
- Backup tags are accepted and discarded.
- List operations return every item. `MaxResults` and `NextToken` do not paginate the result.
- `GetBackupPlan` returns the one stored plan version. `VersionId` is accepted and ignored. Plan
  updates are outside the simulation.
- A compliance lock becomes immutable when its grace period ends. Deleting a lock configuration is
  unsupported.
