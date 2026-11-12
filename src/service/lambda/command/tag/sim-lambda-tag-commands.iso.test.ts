import {
  CreateFunctionCommand,
  GetFunctionCommand,
  ListTagsCommand,
  PublishVersionCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  SimLambdaInvalidParameterValueException,
  SimLambdaResourceNotFoundException,
} from "../../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../../function/code/lambda-zip-file-input.js";
import { SimLambda } from "../../sim-lambda.js";

async function createOrders(
  simLambda: SimLambda,
  tags?: Record<string, string>,
): Promise<string> {
  const created = await simLambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: "arn:aws:iam::111111111111:role/OrdersRole",
      Code: { ZipFile: makeLambdaZipFileInput(() => "handled") },
      Tags: tags,
    }),
  );

  return created.FunctionArn;
}

describe("Lambda tagging commands", () => {
  it("reports the tags a function was created with", async () => {
    // Given a function created with tags.
    const simLambda = new SimLambda();
    const arn = await createOrders(simLambda, { team: "payments" });

    // When its tags are listed and the function is read.
    const listed = await simLambda.listTags(
      new ListTagsCommand({ Resource: arn }),
    );
    const read = await simLambda.getFunction(
      new GetFunctionCommand({ FunctionName: "orders" }),
    );

    // Then both report them.
    assertObjectEquals(listed.Tags, { team: "payments" });
    assertObjectEquals(read.Tags, { team: "payments" });
  });

  it("leaves Tags out of GetFunction for a function with none", async () => {
    const simLambda = new SimLambda();
    await createOrders(simLambda);

    const read = await simLambda.getFunction(
      new GetFunctionCommand({ FunctionName: "orders" }),
    );

    assertUndefined(read.Tags);
  });

  it("adds, replaces and removes tags", async () => {
    // Given a tagged function.
    const simLambda = new SimLambda();
    const arn = await createOrders(simLambda, { team: "payments" });

    // When a tag is replaced, one added, and then one removed.
    await simLambda.tagResource(
      new TagResourceCommand({
        Resource: arn,
        Tags: { team: "billing", tier: "gold" },
      }),
    );
    await simLambda.untagResource(
      new UntagResourceCommand({ Resource: arn, TagKeys: ["tier", "absent"] }),
    );

    // Then only the replaced tag remains.
    const listed = await simLambda.listTags(
      new ListTagsCommand({ Resource: arn }),
    );
    assertObjectEquals(listed.Tags, { team: "billing" });
  });

  it("refuses a version's ARN, since tags belong to the function", async () => {
    // Given a function with a published version.
    const simLambda = new SimLambda();
    const arn = await createOrders(simLambda);
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );

    // When the version is tagged.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.tagResource(
        new TagResourceCommand({ Resource: `${arn}:1`, Tags: { a: "b" } }),
      ),
    );

    // Then real Lambda's refusal is reported.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertStringIncludes(error.message, "aliases and versions");
  });

  it("reports the function's tags when a version is read", async () => {
    // Given a version published before the function was tagged.
    const simLambda = new SimLambda();
    const arn = await createOrders(simLambda);
    await simLambda.publishVersion(
      new PublishVersionCommand({ FunctionName: "orders" }),
    );
    await simLambda.tagResource(
      new TagResourceCommand({ Resource: arn, Tags: { team: "payments" } }),
    );

    // When the version is read.
    const read = await simLambda.getFunction(
      new GetFunctionCommand({ FunctionName: "orders", Qualifier: "1" }),
    );

    // Then the tag added afterwards is reported for it too.
    assertObjectEquals(read.Tags, { team: "payments" });
  });

  it("refuses a key with the reserved aws: prefix", async () => {
    const simLambda = new SimLambda();
    const arn = await createOrders(simLambda);

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.tagResource(
        new TagResourceCommand({
          Resource: arn,
          Tags: { "aws:cloudformation:stack-name": "orders" },
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
  });

  it("refuses a request that would leave more than 50 tags", async () => {
    // Given a function carrying 50 tags.
    const simLambda = new SimLambda();
    const fifty = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [`key-${String(index)}`, "v"]),
    );
    const arn = await createOrders(simLambda, fifty);

    // When one more is added.
    const error = await assertThrowsErrorAsync(async () =>
      simLambda.tagResource(
        new TagResourceCommand({ Resource: arn, Tags: { extra: "v" } }),
      ),
    );

    // Then it is refused and the tags are as they were.
    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    const listed = await simLambda.listTags(
      new ListTagsCommand({ Resource: arn }),
    );
    assertArrayLength(Object.keys(listed.Tags), 50);
  });

  it("refuses an invalid tag on create, so no function is made", async () => {
    const simLambda = new SimLambda();

    const error = await assertThrowsErrorAsync(async () =>
      createOrders(simLambda, { ["x".repeat(129)]: "v" }),
    );

    assertInstanceOf(error, SimLambdaInvalidParameterValueException);
    assertUndefined(simLambda.getSimFunctionByName("orders"));
  });

  it("throws for a function that does not exist", async () => {
    const simLambda = new SimLambda();

    const error = await assertThrowsErrorAsync(async () =>
      simLambda.listTags(
        new ListTagsCommand({
          Resource: "arn:aws:lambda:us-east-1:111111111111:function:missing",
        }),
      ),
    );

    assertInstanceOf(error, SimLambdaResourceNotFoundException);
  });
});
