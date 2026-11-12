import {
  CreateAliasCommand,
  CreateFunctionCommand,
  GetAliasCommand,
  PublishVersionCommand,
  UpdateAliasCommand,
} from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertInstanceOf,
  assertNotEqual,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaPreconditionFailedException } from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";

async function simAwsWithAlias(): Promise<SimAws> {
  const simAws = new SimAws();
  const lambda = simAws.lambda();
  await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
      Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
    }),
  );
  await simAws.backgroundTasksComplete();
  await lambda.publishVersion(
    new PublishVersionCommand({ FunctionName: "orders" }),
  );
  await lambda.publishVersion(
    new PublishVersionCommand({ FunctionName: "orders" }),
  );
  await lambda.createAlias(
    new CreateAliasCommand({
      FunctionName: "orders",
      Name: "live",
      FunctionVersion: "1",
    }),
  );

  return simAws;
}

describe("Lambda alias revisions", () => {
  it("moves an alias on to a new revision with every update", async () => {
    // Given an alias and the revision it reports.
    const simAws = await simAwsWithAlias();
    const before = await simAws
      .lambda()
      .getAlias(new GetAliasCommand({ FunctionName: "orders", Name: "live" }));

    // When it is updated naming that revision.
    const after = await simAws.lambda().updateAlias(
      new UpdateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        FunctionVersion: "2",
        RevisionId: before.RevisionId,
      }),
    );

    // Then the update applies, and the alias reports a revision of its own.
    assertIdentical(after.FunctionVersion, "2");
    assertNotEqual(after.RevisionId, before.RevisionId);
  });

  it("refuses an update naming a revision the alias has moved on from", async () => {
    // Given an alias updated since its revision was read.
    const simAws = await simAwsWithAlias();
    const read = await simAws
      .lambda()
      .getAlias(new GetAliasCommand({ FunctionName: "orders", Name: "live" }));
    await simAws.lambda().updateAlias(
      new UpdateAliasCommand({
        FunctionName: "orders",
        Name: "live",
        Description: "Moved by someone else",
      }),
    );

    // When an update names the revision that was read.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.lambda().updateAlias(
        new UpdateAliasCommand({
          FunctionName: "orders",
          Name: "live",
          FunctionVersion: "2",
          RevisionId: read.RevisionId,
        }),
      ),
    );

    // Then it is refused, and the alias stays where the other change left it.
    assertInstanceOf(error, SimLambdaPreconditionFailedException);
    const alias = await simAws
      .lambda()
      .getAlias(new GetAliasCommand({ FunctionName: "orders", Name: "live" }));
    assertIdentical(alias.FunctionVersion, "1");
  });
});
