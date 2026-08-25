import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { faker } from "@faker-js/faker";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../iam/policy/sim-iam-policy-document.factory.js";

describe("simulated Athena authorization", () => {
  const workGroupName = (): string => `analytics-${faker.string.uuid()}`;

  function workGroupArn(simAws: SimAws, name: string): string {
    return `arn:aws:athena:eu-west-2:${simAws.defaultAccountId}:workgroup/${name}`;
  }

  async function aRoleAllowed(
    simAws: SimAws,
    statements: readonly object[],
  ): Promise<string> {
    const roleName = `athena-reader-${faker.string.uuid()}`;
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );

    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: "AthenaPolicy",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: statements,
        }),
      }),
    );

    return role.Role.Arn;
  }

  it("lets a role read the workgroup its policy names", async () => {
    // Given a workgroup, and a role allowed to read only that one.
    const simAws = new SimAws();
    const name = workGroupName();

    const athena = simAws.region("eu-west-2").account().athena();

    await athena.createWorkGroup({ input: { Name: name } });

    const arn = await aRoleAllowed(simAws, [
      {
        Effect: "Allow",
        Action: "athena:GetWorkGroup",
        Resource: workGroupArn(simAws, name),
      },
    ]);

    // When that role reads it.
    const read = await athena.getWorkGroup(
      { input: { WorkGroup: name } },
      { caller: { kind: "arn", arn } },
    );

    // Then it gets the workgroup.
    assertIdentical(read.WorkGroup?.Name, name);
  });

  it("refuses a role whose policy names a different workgroup", async () => {
    // Given two workgroups, and a role allowed to read only the first.
    const simAws = new SimAws();
    const allowed = workGroupName();
    const other = workGroupName();
    const athena = simAws.region("eu-west-2").account().athena();

    await athena.createWorkGroup({ input: { Name: allowed } });
    await athena.createWorkGroup({ input: { Name: other } });

    const arn = await aRoleAllowed(simAws, [
      {
        Effect: "Allow",
        Action: "athena:GetWorkGroup",
        Resource: workGroupArn(simAws, allowed),
      },
    ]);

    // When it reads the other one.
    const error = await assertThrowsErrorAsync(async () => {
      await athena.getWorkGroup(
        { input: { WorkGroup: other } },
        { caller: { kind: "arn", arn } },
      );
    });

    // Then it is denied, naming the workgroup ARN the policy failed to cover.
    assertIdentical(error.name, "AccessDeniedException");
    assertStringIncludes(error.message, `workgroup/${other}`);
  });

  it("refuses listing workgroups to a policy that names one workgroup", async () => {
    // Given a role allowed every Athena action on one workgroup.
    const simAws = new SimAws();
    const name = workGroupName();
    const athena = simAws.region("eu-west-2").account().athena();

    await athena.createWorkGroup({ input: { Name: name } });

    const arn = await aRoleAllowed(simAws, [
      {
        Effect: "Allow",
        Action: "athena:*",
        Resource: workGroupArn(simAws, name),
      },
    ]);

    // When it lists the workgroups of the account, which names none.
    const error = await assertThrowsErrorAsync(async () => {
      await athena.listWorkGroups(
        { input: {} },
        { caller: { kind: "arn", arn } },
      );
    });

    // Then it is denied, as it is on real AWS. ListWorkGroups is evaluated
    // against `*`, and only a policy whose Resource is `*` allows it.
    assertIdentical(error.name, "AccessDeniedException");
  });

  it("authorizes a named query against the workgroup it belongs to", async () => {
    // Given a workgroup with a saved query, and a role allowed only to list
    // that workgroup's named queries.
    const simAws = new SimAws();
    const name = workGroupName();
    const athena = simAws.region("eu-west-2").account().athena();

    await athena.createWorkGroup({ input: { Name: name } });
    await athena.createNamedQuery({
      input: {
        Name: "pageviews",
        Database: "rainlytics",
        QueryString: "SELECT 1",
        WorkGroup: name,
      },
    });

    const arn = await aRoleAllowed(simAws, [
      {
        Effect: "Allow",
        Action: "athena:ListNamedQueries",
        Resource: workGroupArn(simAws, name),
      },
    ]);

    // When that role lists them.
    const listed = await athena.listNamedQueries(
      { input: { WorkGroup: name } },
      { caller: { kind: "arn", arn } },
    );

    // Then the workgroup ARN was enough, because a named query has none of
    // its own.
    assertArrayLength(listed.NamedQueryIds ?? [], 1);
  });

  it("refuses a batch read to a role the named query's workgroup excludes", async () => {
    // Given a saved query in a workgroup, and a role allowed a different one.
    const simAws = new SimAws();
    const holding = workGroupName();
    const athena = simAws.region("eu-west-2").account().athena();

    await athena.createWorkGroup({ input: { Name: holding } });

    const created = await athena.createNamedQuery({
      input: {
        Name: "referrers",
        Database: "rainlytics",
        QueryString: "SELECT 1",
        WorkGroup: holding,
      },
    });

    const arn = await aRoleAllowed(simAws, [
      {
        Effect: "Allow",
        Action: "athena:BatchGetNamedQuery",
        Resource: workGroupArn(simAws, workGroupName()),
      },
    ]);

    // When it reads the query in a batch.
    const error = await assertThrowsErrorAsync(async () => {
      await athena.batchGetNamedQuery(
        { input: { NamedQueryIds: [String(created.NamedQueryId)] } },
        { caller: { kind: "arn", arn } },
      );
    });

    // Then the batch is denied rather than answering with the query.
    assertIdentical(error.name, "AccessDeniedException");
  });

  it("writes a query's results under the caller that ran it", async () => {
    // Given a results Bucket, a workgroup pointing at it, and a role allowed
    // to run queries but not to write to that Bucket.
    const simAws = new SimAws();
    const name = workGroupName();
    const athena = simAws.region("eu-west-2").account().athena();

    await simAws
      .region("eu-west-2")
      .account()
      .s3()
      .createBucket({ input: { Bucket: "locked-results" } });
    await athena.createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          ResultConfiguration: { OutputLocation: "s3://locked-results/q/" },
        },
      },
    });

    const arn = await aRoleAllowed(simAws, [
      {
        Effect: "Allow",
        Action: "athena:*",
        Resource: workGroupArn(simAws, name),
      },
    ]);

    // When that role runs a query.
    const started = await athena.startQueryExecution(
      { input: { QueryString: "SELECT 1", WorkGroup: name } },
      { caller: { kind: "arn", arn } },
    );

    await simAws.backgroundTasksComplete();

    // Then the query failed on the write. Athena writes a result set under
    // the identity that asked for it rather than a role of its own, so a
    // caller who cannot write to the Bucket cannot get results out of it.
    const execution = await athena.getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    const status = execution.QueryExecution?.Status;

    assertNonNullable(status);
    assertIdentical(status.State, "FAILED");
    assertStringIncludes(
      String(status.StateChangeReason),
      "could not be written",
    );
  });

  it("writes results for a caller its policy allows the Bucket to", async () => {
    // Given the same setup, with the role also allowed to write there.
    const simAws = new SimAws();
    const name = workGroupName();
    const athena = simAws.region("eu-west-2").account().athena();

    await simAws
      .region("eu-west-2")
      .account()
      .s3()
      .createBucket({ input: { Bucket: "open-results" } });
    await athena.createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          ResultConfiguration: { OutputLocation: "s3://open-results/q/" },
        },
      },
    });

    const arn = await aRoleAllowed(simAws, [
      {
        Effect: "Allow",
        Action: "athena:*",
        Resource: workGroupArn(simAws, name),
      },
      { Effect: "Allow", Action: "s3:PutObject", Resource: "*" },
    ]);

    // When that role runs a query.
    const started = await athena.startQueryExecution(
      { input: { QueryString: "SELECT 1", WorkGroup: name } },
      { caller: { kind: "arn", arn } },
    );

    await simAws.backgroundTasksComplete();

    // Then it succeeded.
    const execution = await athena.getQueryExecution({
      input: { QueryExecutionId: started.QueryExecutionId },
    });

    assertIdentical(execution.QueryExecution?.Status?.State, "SUCCEEDED");
  });
});
