import {
  CreateAliasCommand,
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  DeleteAliasCommand,
  GetFunctionUrlConfigCommand,
  ListFunctionUrlConfigsCommand,
  PublishVersionCommand,
  UpdateFunctionCodeCommand,
} from "@aws-sdk/client-lambda";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNotEqual,
  assertResponseStatus,
  assertThrowsErrorAsync,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  SimLambdaResourceNotFoundException,
  SimLambdaValidationException,
} from "../error/sim-lambda.error.js";
import { makeLambdaZipFileInput } from "../function/code/lambda-zip-file-input.js";

/**
 * A function whose version 1 answers "published", with the alias `live` on
 * it, and whose `$LATEST` has since moved on to answer "latest".
 */
async function simAwsWithAliasedFunction(): Promise<SimAws> {
  const simAws = new SimAws();
  const lambda = simAws.lambda();
  await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: "orders",
      Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersRole`,
      Code: { ZipFile: makeLambdaZipFileInput(() => "published") },
    }),
  );
  await simAws.backgroundTasksComplete();
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
  await lambda.updateFunctionCode(
    new UpdateFunctionCodeCommand({
      FunctionName: "orders",
      ZipFile: makeLambdaZipFileInput(() => "latest"),
    }),
  );
  await simAws.backgroundTasksComplete();

  return simAws;
}

async function createUrl(simAws: SimAws, qualifier?: string): Promise<string> {
  const { FunctionUrl } = await simAws.lambda().createFunctionUrlConfig(
    new CreateFunctionUrlConfigCommand({
      FunctionName: "orders",
      Qualifier: qualifier,
      AuthType: "NONE",
    }),
  );

  return FunctionUrl;
}

async function fetchText(simAws: SimAws, functionUrl: string): Promise<string> {
  const response = await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: functionUrl }).toString(),
  );
  assertResponseStatus(response, 200, await describeResponse(response));

  return await response.text();
}

describe("Function URLs on an alias", () => {
  it("serves the version an alias points at, beside the function's own URL", async () => {
    // Given a function with a URL of its own and one on its alias.
    const simAws = await simAwsWithAliasedFunction();
    const latestUrl = await createUrl(simAws);
    const liveUrl = await createUrl(simAws, "live");

    // When each URL is requested.
    const latest = await fetchText(simAws, latestUrl);
    const live = await fetchText(simAws, liveUrl);

    // Then each has a hostname of its own, and runs the code behind it.
    assertNotEqual(liveUrl, latestUrl);
    assertIdentical(latest, '"latest"');
    assertIdentical(live, '"published"');
  });

  it("reports an alias URL under the alias ARN, and lists it with the function's", async () => {
    const simAws = await simAwsWithAliasedFunction();
    await createUrl(simAws);
    await createUrl(simAws, "live");

    const read = await simAws.lambda().getFunctionUrlConfig(
      new GetFunctionUrlConfigCommand({
        FunctionName: "orders",
        Qualifier: "live",
      }),
    );
    const listed = await simAws
      .lambda()
      .listFunctionUrlConfigs(
        new ListFunctionUrlConfigsCommand({ FunctionName: "orders" }),
      );

    assertIdentical(
      read.FunctionArn,
      `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:orders:live`,
    );
    assertArrayLength(listed.FunctionUrlConfigs, 2);
  });

  it("refuses a version number, and an alias the function does not have", async () => {
    const simAws = await simAwsWithAliasedFunction();

    const versioned = await assertThrowsErrorAsync(async () =>
      createUrl(simAws, "1"),
    );
    const absent = await assertThrowsErrorAsync(async () =>
      createUrl(simAws, "staging"),
    );

    assertInstanceOf(versioned, SimLambdaValidationException);
    assertInstanceOf(absent, SimLambdaResourceNotFoundException);
  });

  it("takes an alias's URL away with the alias", async () => {
    // Given an alias with a URL.
    const simAws = await simAwsWithAliasedFunction();
    await createUrl(simAws, "live");

    // When the alias is deleted.
    await simAws
      .lambda()
      .deleteAlias(
        new DeleteAliasCommand({ FunctionName: "orders", Name: "live" }),
      );

    // Then its URL is gone too.
    assertUndefined(simAws.lambda().getSimFunctionUrl("orders", "live"));
  });

  it("puts a template's Function URL on the alias its Qualifier names", async () => {
    // Given a deployed alias.
    const simAws = await simAwsWithAliasedFunction();

    // When a template creates a URL for it the way CDK's
    // Alias.addFunctionUrl() writes one.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-url",
      template: {
        Resources: {
          LiveUrl: {
            Type: "AWS::Lambda::Url",
            Properties: {
              TargetFunctionArn: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:orders`,
              Qualifier: "live",
              AuthType: "NONE",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the URL serves the alias's version.
    const functionUrl = simAws.lambda().getSimFunctionUrl("orders", "live");
    assertIdentical(
      await fetchText(simAws, functionUrl?.url ?? ""),
      '"published"',
    );
  });
});
