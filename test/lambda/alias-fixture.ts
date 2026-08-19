/**
 * A function with a published version behind an alias, which every test of a
 * service delivering to a qualified function ARN needs before it can say which
 * version ran.
 *
 * This lives under `test/` for the same reason as the other fixtures here:
 * eslint rejects a test file that exports helpers alongside its own `describe`
 * calls, and `test/**` is type-checked with everything else, excluded from the
 * published build, not collected as a suite, and not counted in coverage.
 */

import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";

/** The alias every one of these tests points its target at. */
export const simLambdaLiveAlias = "live";

/**
 * A function, the version behind its alias, and what each invocation ran as.
 */
export interface SimLambdaAliasedFunction {
  /** The unqualified ARN of the function itself. */
  readonly functionArn: string;

  /** The ARN of the alias, which is what a qualified target names. */
  readonly aliasArn: string;

  /** The version number the alias points at. */
  readonly version: string;

  /**
   * The version each invocation ran as, in invocation order.
   *
   * This is what tells an invocation of the alias apart from one of `$LATEST`,
   * since a published version is a copy of the function and behaves the same
   * way in every other respect.
   */
  readonly ranAs: string[];

  /** The event each invocation was handed, in invocation order. */
  readonly events: unknown[];
}

interface SimLambdaAliasedFunctionOptions {
  readonly roleArn?: string;

  /**
   * What the handler answers with, for a caller that reads the result.
   *
   * A Cognito trigger reads it and goes on with what it was handed, where an
   * event notification drops it, so it is given the event rather than being a
   * value.
   */
  readonly result?: (event: unknown) => unknown;
}

/**
 * Create a function, publish a version of it, and point an alias at that
 * version.
 *
 * The handler records the version it ran as, so a test asserts on which
 * version a delivery reached rather than on the delivery having happened at
 * all.
 */
export async function simLambdaAliasedFunction(
  simAws: SimAws,
  functionName: string,
  options: SimLambdaAliasedFunctionOptions = {},
): Promise<SimLambdaAliasedFunction> {
  const ranAs: string[] = [];
  const events: unknown[] = [];
  const lambda = simAws.lambda();

  await lambda.createFunction(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role:
        options.roleArn ??
        `arn:aws:iam::${simAws.defaultAccountId}:role/${functionName}Role`,
      Code: {
        ZipFile: makeLambdaZipFileInput((event, context) => {
          ranAs.push(context.functionVersion);
          events.push(event);

          return options.result === undefined
            ? "handled"
            : options.result(event);
        }),
      },
    }),
  );
  await simAws.backgroundTasksComplete();

  const published = await lambda.publishVersion(
    new PublishVersionCommand({ FunctionName: functionName }),
  );

  assertNonNullable(
    published.Version,
    "PublishVersion answered with a version",
  );

  await lambda.createAlias(
    new CreateAliasCommand({
      FunctionName: functionName,
      Name: simLambdaLiveAlias,
      FunctionVersion: published.Version,
    }),
  );

  const functionArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:${functionName}`;

  return {
    functionArn,
    aliasArn: `${functionArn}:${simLambdaLiveAlias}`,
    version: published.Version,
    ranAs,
    events,
  };
}

/**
 * Grant a service principal the invoke action on the alias alone.
 *
 * The grant is made with a `Qualifier`, so it is held against the alias rather
 * than against the function, which is what makes it the grant a delivery
 * through the alias needs.
 */
export async function simLambdaAllowAliasInvoke(
  simAws: SimAws,
  functionName: string,
  servicePrincipal: string,
  sourceArn?: string,
): Promise<void> {
  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: functionName,
      Qualifier: simLambdaLiveAlias,
      StatementId: "AllowService",
      Action: "lambda:InvokeFunction",
      Principal: servicePrincipal,
      ...(sourceArn !== undefined && { SourceArn: sourceArn }),
    }),
  );
}
