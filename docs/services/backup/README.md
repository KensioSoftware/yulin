# Simulated AWS Backup

Yulin includes simulated AWS Backup vaults, plans and selections for tests and local development.
The simulation stores backup configuration. Backup jobs and recovery points are outside it.
AWS Backup types are imported from the `@kensio/yulin/backup` subpath.

## Creating a vault, plan and selection

`simAws.backup()` gives the AWS Backup service for the default account and Region. A plan rule names
an existing vault. A selection belongs to one plan and records the resource ARNs assigned to it.

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

A plan needs at least one rule. Every rule needs a name and a target vault. An omitted schedule uses
`cron(0 5 ? * * *)`, the AWS Backup default. Six-field AWS cron expressions and rate expressions
are validated when the plan is created. A one-time `at(...)` expression is refused.

`MoveToColdStorageAfterDays` can be combined with `DeleteAfterDays`. The deletion must be at least
90 days after the move to cold storage. A shorter lifecycle raises
`InvalidParameterValueException`. Set both values to `-1` to retain recovery points indefinitely.

## Vault Lock

`PutBackupVaultLockConfiguration` records minimum and maximum retention periods on a vault. Adding
`ChangeableForDays` creates a compliance lock. The configuration stays changeable until the grace
period ends, then becomes immutable.

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
`AWS::Backup::BackupSelection`. References between the resources resolve before AWS Backup creates
them.

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

Every supported operation is authorized by simulated IAM. Vault operations use the vault ARN. Plan
and selection operations use the plan ARN. `ListBackupVaults` has no resource in its request and is
authorized against `*`.

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

Authorization runs before resource lookup. An unauthorized request for a missing vault or plan
raises `AccessDeniedException`, without revealing whether the resource exists.

## SDK interception

`SimSdk` routes commands from an AWS `BackupClient` to the simulation. Intercept the client instance
when a test owns it, or intercept the class when application code creates the client.

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

The client's configured Region selects the simulated Region. Credentials select the account and
caller when the intercepted client has them. See the [SDK interception docs](https://yulinsim.dev/sdk/)
for class interception and credential handling.

## Account and Region scoping

AWS Backup state belongs to one account and Region. The same vault name can exist in another scope.

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
- IAM authorization for every supported command.
- SDK interception of `BackupClient`.
- Account and Region scoped state, ARNs and timestamps.
- `AWS::Backup::BackupVault`, `AWS::Backup::BackupPlan` and `AWS::Backup::BackupSelection` through
  simulated CloudFormation.

## Limitations

- Backup jobs, recovery point copies, restores and expiry are outside the simulation.
- A vault always reports `NumberOfRecoveryPoints` as zero. Vault deletion always sees an empty
  vault.
- A plan schedule is parsed and stored. Advancing simulated time leaves it unchanged.
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
