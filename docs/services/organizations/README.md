# Simulated Organizations

Yulin simulates AWS Organizations service control policies (SCPs) and organization structure.

An SCP limits permissions granted by identity and resource policies. Attach one to the organization
root, an organizational unit or an account. An account inherits policies from every node on its path
from the root. Simulated IAM applies them to direct calls, intercepted clients and CloudFormation.

## Attach a policy to an organizational unit

Create an organizational unit and attach an SCP to it. Accounts below the unit inherit the policy.

```typescript sim-organizations-organizational-unit
/**
 * Inheriting a service control policy from an organizational unit.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const organizations = simAws.organizations();

const workloads = organizations.createOrganizationalUnit("Workloads");
const production = organizations.createOrganizationalUnit(
  "Production",
  workloads,
);

organizations.moveAccount("123456789012", production);
organizations.attachServiceControlPolicy(workloads, {
  Version: "2012-10-17",
  Statement: { Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" },
});

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::reports-bucket",
});

console.log(decision.value); // "ExplicitDeny"
```

Pass a parent as the second argument to `createOrganizationalUnit` to nest units. With no parent, the
new unit sits below `organizations.root()`.

## Every level has to allow the action

Every node on the path must allow the action. An allow at one level cannot supply an allow missing
at another. A deny at any level rejects the request.

```typescript sim-organizations-every-level-allows
/**
 * Each level of the organization allowing the action separately.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const organizations = simAws.organizations();
const workloads = organizations.createOrganizationalUnit("Workloads");

organizations.moveAccount("123456789012", workloads);

organizations.detachFullAwsAccess(organizations.root());
organizations.attachServiceControlPolicy(organizations.root(), {
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
});

organizations.detachFullAwsAccess(workloads);
organizations.attachServiceControlPolicy(workloads, {
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "dynamodb:*", Resource: "*" },
});

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
});

console.log(decision.value); // "ImplicitDeny"
console.log(decision.serviceControlPolicy.unallowedLevels); // [ "Workloads" ]
```

`unallowedLevels` identifies the nodes with no matching allow.

## The management account

Use `setManagementAccount` to exempt one account from SCP evaluation. Its identity and resource
policies still apply.

```typescript sim-organizations-management-account
/**
 * Exempting the management account.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const organizations = simAws.organizations();

organizations.attachServiceControlPolicy(organizations.root(), {
  Version: "2012-10-17",
  Statement: { Effect: "Deny", Action: "*", Resource: "*" },
});
organizations.setManagementAccount("111111111111");

const decision = simAws.account("111111111111").iam().authorize({
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::reports-bucket",
});

console.log(decision.isAllowed); // true
console.log(decision.serviceControlPolicy.isApplied); // false
```

## Attach a service control policy to an Account

An SCP attached directly to an account applies only to that account. Organization state belongs to
the whole `SimAws` instance and is available through `simAws.organizations()`.

```typescript sim-organizations-attach-scp
/**
 * Denying an action with a simulated service control policy.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

simAws.organizations().attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: {
    Sid: "DenyBucketCreation",
    Effect: "Deny",
    Action: "s3:CreateBucket",
    Resource: "*",
  },
});

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::reports-bucket",
});

console.log(decision.value); // "ExplicitDeny"
console.log(decision.serviceControlPolicy.isDenied); // true
console.log(decision.serviceControlPolicy.denyStatements[0]?.Sid); // "DenyBucketCreation"
```

New organization nodes receive the AWS-managed `FullAWSAccess` policy. A deny-list SCP can then
block one action while leaving other actions allowed.

An account outside the organization is unaffected by SCPs.

## Catch a deployment the policy denies

CloudFormation creates resources through each service's authorized command path. A deployment with
no caller runs as the account root, and SCPs apply to that root.

```typescript sim-organizations-scp-deployment
/**
 * A CloudFormation Resource a service control policy denies.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

simAws.organizations().attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: { Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" },
});

try {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "reports-stack",
    template: {
      Resources: {
        ReportsBucket: {
          Type: "AWS::S3::Bucket",
          Properties: { BucketName: "reports-bucket" },
        },
      },
    },
  });

  await stack.waitForDeployComplete();
} catch (error) {
  // "... is not authorized to perform: s3:CreateBucket on resource:
  //  arn:aws:s3:::reports-bucket with an explicit deny in a service control policy"
  console.log((error as Error).message);
}

const failed = simAws
  .cloudFormation()
  .getStackByName("reports-stack")
  ?.getResource("ReportsBucket");

console.log(failed?.status); // "CREATE_FAILED"
```

When an SCP denies creation, the resource enters `CREATE_FAILED` and the deployment rejects. The
error names the policy.

## Name the principal a deployment runs as

Pass `caller` when the deployment should run as a role. SCP conditions on `aws:PrincipalArn` then
evaluate against that role.

```typescript sim-organizations-scp-deploy-role
/**
 * A policy denying the account root, and a deployment that names a Role.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const simIam = simAws.iam();

const roleCreation = await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "cdk-deploy-role",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { Service: "cloudformation.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "cdk-deploy-role",
    PolicyName: "Deploy",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
    }),
  }),
);

simAws.organizations().attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: {
    Sid: "DenyRootPrincipal",
    Effect: "Deny",
    Action: "*",
    Resource: "*",
    Condition: { ArnLike: { "aws:PrincipalArn": "arn:aws:iam::*:root" } },
  },
});

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "reports-stack",
  template: {
    Resources: {
      ReportsBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: "reports-bucket" },
      },
    },
  },
  caller: { kind: "arn", arn: roleCreation.Role.Arn },
});

console.log(stack.getResource("ReportsBucket")?.status); // "CREATE_COMPLETE"
```

Create the role before attaching a policy that would deny the setup call.

## Name the caller the rest of a test reads as

A deployment caller applies only to that deployment. Other calls still use the account root unless
the simulation has a default caller.

Set `defaultCaller` on `SimAws` to choose the principal for unattributed calls. An explicit `caller`
still takes precedence.

```typescript sim-organizations-scp-default-caller
/**
 * Reading an account whose organization denies its root principal.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SimAws } from "@kensio/yulin";

const administratorArn = "arn:aws:iam::123456789012:role/Administrator";

const simAws = new SimAws({
  defaultAccountId: "123456789012",
  defaultCaller: { kind: "arn", arn: administratorArn },
});

// The Role is created as the account root, because a simulation with a default
// caller attributes these two commands to a Role that has no policy yet.
const root = simAws.account().rootPrincipal;
const simIam = simAws.iam();

await simIam.createRole(
  new CreateRoleCommand({
    RoleName: "Administrator",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Principal: { AWS: "arn:aws:iam::123456789012:root" },
        Action: "sts:AssumeRole",
      },
    }),
  }),
  { caller: root },
);

await simIam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Administrator",
    PolicyName: "Administer",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: { Effect: "Allow", Action: "*", Resource: "*" },
    }),
  }),
  { caller: root },
);

simAws.organizations().attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: {
    Sid: "DenyRootPrincipal",
    Effect: "Deny",
    Action: "*",
    Resource: "*",
    Condition: { ArnLike: { "aws:PrincipalArn": "arn:aws:iam::*:root" } },
  },
});

await simAws.ssm().putParameter({
  input: { Name: "/reports/bucket", Type: "String", Value: "reports-bucket" },
});

const read = await simAws
  .ssm()
  .getParameter({ input: { Name: "/reports/bucket" } });

const identity = await simAws.sts().getCallerIdentity({});

console.log(read.Parameter?.Value); // "reports-bucket"
console.log(identity.Arn); // "arn:aws:iam::123456789012:role/Administrator"
```

Create and configure the default caller before attaching policies that would deny those setup calls.
Pass `simAws.account().rootPrincipal` explicitly when a test needs to make a request as root.

## Write an allow list instead of a deny list

Call `detachFullAwsAccess` to use an allow-list SCP. The remaining policies must explicitly allow an
action.

```typescript sim-organizations-scp-allow-list
/**
 * Allowing only what the attached policies name.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });
const organizations = simAws.organizations();

organizations.detachFullAwsAccess("123456789012");
organizations.attachServiceControlPolicy("123456789012", {
  Version: "2012-10-17",
  Statement: { Effect: "Allow", Action: "dynamodb:*", Resource: "*" },
});

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:GetObject",
  resource: "arn:aws:s3:::reports-bucket/summary.csv",
});

console.log(decision.value); // "ImplicitDeny"
console.log(decision.denialReason);
// "because no service control policy allows the s3:GetObject action"
```

SCPs still limit an account root. Removing `FullAWSAccess` without adding another allow policy denies
every action.

## Deploy an organization from CloudFormation

Simulated CloudFormation supports the organization, organizational unit, account and policy
resource types.

```typescript sim-organizations-cloudformation
/**
 * Building an organization from a CloudFormation template.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultAccountId: "123456789012" });

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "org-stack",
  template: {
    Resources: {
      Organization: { Type: "AWS::Organizations::Organization" },
      Workloads: {
        Type: "AWS::Organizations::OrganizationalUnit",
        Properties: {
          Name: "Workloads",
          ParentId: { "Fn::GetAtt": ["Organization", "RootId"] },
        },
      },
      DenyBucketCreation: {
        Type: "AWS::Organizations::Policy",
        Properties: {
          Name: "DenyBucketCreation",
          Type: "SERVICE_CONTROL_POLICY",
          TargetIds: [{ Ref: "Workloads" }],
          Content: {
            Version: "2012-10-17",
            Statement: [
              { Effect: "Deny", Action: "s3:CreateBucket", Resource: "*" },
            ],
          },
        },
      },
    },
    Outputs: { WorkloadsId: { Value: { Ref: "Workloads" } } },
  },
});

await stack.waitForDeployComplete();

simAws.organizations().moveAccount("123456789012", stack.output("WorkloadsId"));

const decision = simAws.account("123456789012").iam().authorize({
  action: "s3:CreateBucket",
  resource: "arn:aws:s3:::reports-bucket",
});

console.log(decision.value); // "ExplicitDeny"
```

`Content` accepts an object or JSON text. `TargetIds` accepts one target or a list of roots, units and
accounts. An unknown target fails the resource before the policy is attached anywhere.

A `SimAws` instance starts with one organization. `AWS::Organizations::Organization` adopts it and
exposes its `RootId`.

`AWS::Organizations::Account` generates an account ID. Read it with `Ref` or `Fn::GetAtt AccountId`.

These are the properties read from each resource:

| Resource                                 | Read                                   | Recorded and skipped  |
| ---------------------------------------- | -------------------------------------- | --------------------- |
| `AWS::Organizations::Organization`       | `FeatureSet`                           | `FeatureSet`          |
| `AWS::Organizations::OrganizationalUnit` | `Name`, `ParentId`                     | `Tags`                |
| `AWS::Organizations::Account`            | `AccountName`, `Email`, `ParentIds`    | `Tags`, `RoleName`    |
| `AWS::Organizations::Policy`             | `Name`, `Type`, `Content`, `TargetIds` | `Tags`, `Description` |

Stack teardown removes resources created by that stack. Policies from other stacks remain attached.
Accounts and child units move to the deleted unit's parent.

## Reading a denial

An authorization decision reports the organization's verdict apart from the identity and resource
sides, through `decision.serviceControlPolicy`:

| Property          | Meaning                                                     |
| ----------------- | ----------------------------------------------------------- |
| `isApplied`       | Whether any service control policy applied to the request.  |
| `isDenied`        | Whether the attached policies denied it, either way.        |
| `isExplicitDeny`  | Whether a matching `Deny` statement denied it.              |
| `isImplicitDeny`  | Whether the attached policies produced no matching `Allow`. |
| `denyStatements`  | The matching `Deny` statements.                             |
| `allowStatements` | The matching `Allow` statements.                            |

`decision.denialReason` contains the text used by service access-denied errors.

`serviceControlPoliciesFor(accountId)` returns the policies in evaluation order.

`serviceControlPolicySetFor(accountId).levels` groups policies by node, starting at the root.

An empty policy list can mean that the account is outside the organization, is the management
account or has no policies. The first two are exempt. The last is denied every action. Check
`serviceControlPolicySetFor(accountId).applies` or `decision.serviceControlPolicy.isApplied` to
distinguish them.

## Available functionality

Simulated Organizations supports:

- `createOrganizationalUnit`, creating a unit under the root or under another unit
- `moveAccount`, putting an Account under a unit or under the root
- `root`, the node above every Account in the organization
- `setManagementAccount`, exempting the Account AWS exempts
- `attachServiceControlPolicy`, attaching a policy document to the root, a unit, or an Account, and
  answering with the id that takes it off again
- `detachServiceControlPolicy`, taking one policy off a node and leaving the rest
- `accountIds`, reading which Accounts the organization holds
- `detachFullAwsAccess`, turning a node's policies into an allow list
- `detachServiceControlPolicies`, taking every policy back off one node and leaving the rest alone
- `removeAccount`, taking an Account out of the organization
- `serviceControlPoliciesFor`, reading the policies in force for an Account
- `serviceControlPolicySetFor`, reading those policies along with whether any apply
- The AWS-managed `FullAWSAccess` policy, attached by default as it is in AWS
- Evaluation ahead of identity and resource policies, for every principal in the Account including
  its root
- Inheritance down the root-to-Account path, with every level having to allow the action
- AWS-shaped `r-` and `ou-` node ids
- `Action`, `NotAction`, `Resource`, `NotResource` and `Condition` in an SCP statement
- The `ArnEquals`, `ArnLike`, `NumericLessThanEquals`, `StringEquals` and `StringLike` condition
  operators, and their `ForAnyValue:` and `ForAllValues:` set forms
- The negated `ArnNotEquals`, `ArnNotLike`, `StringNotEquals` and `StringNotLike` operators and
  their set forms, which a `Deny` statement exempting named roles hangs on `aws:PrincipalArn`
- `AccessDenied` messages naming the service control policy, as AWS words them
- Denial reporting through `decision.serviceControlPolicy`, naming the levels that allowed nothing
- The `AWS::Organizations::Organization`, `::OrganizationalUnit`, `::Account` and `::Policy`
  CloudFormation resources, with `Ref` and `Fn::GetAtt`, and teardown

## Limitations

| Limitation                  | Detail                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Management account          | Named with `setManagementAccount`. An organization with none named exempts no Account.                                              |
| Moving an Account           | `moveAccount` places an Account and can move it again. Nothing records where it was before.                                         |
| Service-linked roles        | Evaluated like any other principal. AWS exempts a service-linked role from SCPs.                                                    |
| Other policy types          | Resource control policies, declarative policies, tag policies, backup policies and AI services opt-out policies are not simulated.  |
| The Organizations SDK       | `CreatePolicy`, `AttachPolicy`, `ListAccounts` and the rest of the API are not handled. Policies are attached through the accessor. |
| Organization condition keys | `aws:PrincipalOrgID` and `aws:PrincipalOrgPaths` are not populated. A condition naming either fails to match.                       |
| Service principals          | A request whose caller is a service principal or anonymous belongs to no Account and is subject to no policy.                       |
| Condition operator coverage | The operators above are evaluated. Anything else fails closed and the statement holding it matches nothing.                         |
| HTTP API                    | Organizations is not served as an HTTP API by `serveSimAws`.                                                                        |
