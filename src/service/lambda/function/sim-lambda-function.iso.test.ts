import {
  assertIdentical,
  assertNumberBetween,
  assertObjectEquals,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import { simAwsRunAsContext } from "../../aws/caller/sim-aws-run-as-context.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimLambdaContext } from "./sim-lambda-handler.type.js";
import { SimLambdaFunction } from "./sim-lambda-function.js";

const accountRegionScope = {
  accountId: "111111111111" as SimAwsAccountId,
  regionName: "eu-west-2" as AwsRegionName,
};

describe("sim Lambda function model", () => {
  it("builds an AWS-like function ARN with a colon-addressed name", () => {
    const simFunction = new SimLambdaFunction({
      name: "arn-test",
      roleArn: "arn:aws:iam::111111111111:role/ArnTestRole",
      accountRegionScope,
    });

    assertIdentical(
      simFunction.arn,
      "arn:aws:lambda:eu-west-2:111111111111:function:arn-test",
    );
  });

  it("publishes a copy of itself under a version number", async () => {
    // Given a function with code, configuration and an environment.
    const simFunction = new SimLambdaFunction({
      name: "publish-test",
      roleArn: "arn:aws:iam::111111111111:role/PublishRole",
      accountRegionScope,
      handlerFunction: () => "published code",
      handlerName: "index.handler",
      timeoutSeconds: 30,
      memorySizeMb: 512,
    });

    // When it is published as version 1.
    const version = simFunction.publishedAs("1");

    // Then the version is a copy carrying what it was published with, and the
    // function it came from is still $LATEST.
    assertIdentical(version.version, "1");
    assertIdentical(
      version.arn,
      "arn:aws:lambda:eu-west-2:111111111111:function:publish-test:1",
    );
    assertIdentical(await version.invoke({}), "published code");

    const configuration = version.configuration();
    assertIdentical(configuration.Version, "1");
    assertIdentical(configuration.State, "Active");
    assertIdentical(configuration.Handler, "index.handler");
    assertIdentical(configuration.Timeout, 30);
    assertIdentical(configuration.MemorySize, 512);

    assertIdentical(simFunction.version, "$LATEST");
    assertIdentical(simFunction.configuration().Version, "$LATEST");
    assertIdentical(simFunction.state, "Pending");
  });

  it("starts Pending with AWS-like defaults and activates to Active", async () => {
    const simFunction = new SimLambdaFunction({
      name: "defaults-test",
      roleArn: "arn:aws:iam::111111111111:role/DefaultsRole",
      accountRegionScope,
    });

    assertIdentical(simFunction.state, "Pending");

    const configuration = simFunction.configuration();
    assertIdentical(configuration.State, "Pending");
    assertIdentical(configuration.Version, "$LATEST");
    assertIdentical(configuration.Timeout, 3);
    assertIdentical(configuration.MemorySize, 128);
    assertUndefined(configuration.Handler);

    await simFunction.activate();
    assertIdentical(simFunction.state, "Active");
    assertIdentical(simFunction.configuration().State, "Active");
  });

  it("echoes the invocation event with the default handler", async () => {
    const simFunction = new SimLambdaFunction({
      name: "echo-test",
      roleArn: "arn:aws:iam::111111111111:role/EchoRole",
      accountRegionScope,
    });

    const result = await simFunction.invoke({ ping: "pong" });

    assertObjectEquals(result as object, { ping: "pong" });
  });

  it("passes an AWS-like invocation context to the handler", async () => {
    let observedContext: SimLambdaContext | undefined;
    const simFunction = new SimLambdaFunction({
      name: "context-test",
      roleArn: "arn:aws:iam::111111111111:role/ContextRole",
      accountRegionScope,
      handlerFunction: (_event, context) => {
        observedContext = context;
        return null;
      },
      timeoutSeconds: 10,
      memorySizeMb: 256,
    });

    await simFunction.invoke({});

    assertIdentical(observedContext?.functionName, "context-test");
    assertIdentical(observedContext.functionVersion, "$LATEST");
    assertIdentical(observedContext.invokedFunctionArn, simFunction.arn);
    assertIdentical(observedContext.memoryLimitInMB, "256");
    assertIdentical(observedContext.logGroupName, "/aws/lambda/context-test");
    assertTypeString(observedContext.awsRequestId);
    const remainingMs = observedContext.getRemainingTimeInMillis();
    assertNumberBetween(remainingMs, 1, 10_000);
  });

  it("runs the handler with the execution Role as the ambient caller", async () => {
    const roleArn = "arn:aws:iam::111111111111:role/AmbientRole";
    let observedCaller: SimAwsPrincipal | undefined;

    const simFunction = new SimLambdaFunction({
      name: "ambient-test",
      roleArn,
      accountRegionScope,
      handlerFunction: () => {
        observedCaller = simAwsRunAsContext.currentCaller(simFunction);
        return null;
      },
    });

    await simFunction.invoke({});

    // The standalone function is its own run-as owner.
    assertObjectEquals(observedCaller as unknown as object, {
      kind: "arn",
      arn: roleArn,
    });

    // The ambient caller does not leak outside the invocation.
    assertUndefined(simAwsRunAsContext.currentCaller(simFunction));
  });
});
