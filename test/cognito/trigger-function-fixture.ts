/**
 * The function a user pool's `LambdaConfig` names, and the permission that lets
 * Cognito invoke it.
 *
 * This is the half of the trigger arrangement that has nothing to do with the
 * pool, so the federation fixture reaches for it without taking the pool
 * `trigger-fixture.ts` builds.
 */

import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { DEFAULT_SIM_AWS_ACCOUNT_ID } from "../../src/service/aws/sim-aws-account.js";
import { DEFAULT_SIM_AWS_REGION_NAME } from "../../src/service/aws/sim-aws-region.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../src/service/lambda/function/sim-lambda-handler.type.js";

/**
 * A trigger handler that hands the event back untouched, which is what a
 * handler with nothing to say has to do.
 */
export const passThroughHandler: SimLambdaHandler = (event: unknown) => event;

/** The name of the function every trigger in the fixture points at. */
export const triggerFunctionName = "auth-trigger";

/**
 * What a test says about the function behind its triggers.
 */
export interface SimCognitoTriggerFunctionInput {
  /**
   * What the function does when a trigger invokes it, as a handler function.
   *
   * This is the quick way to say what a trigger does, and it is ignored when
   * `code` is given as well: the two are alternatives, and the archive wins.
   */
  readonly handler?: SimLambdaHandler | undefined;

  /**
   * A real code archive to run instead of a handler function.
   *
   * Function code that calls another simulated service has to be an archive,
   * because that is what runs in the Lambda vm with the runtime's own AWS SDK
   * provided to it.
   */
  readonly code?: Uint8Array | undefined;

  /** The execution Role the function runs as, and its SDK calls are made as. */
  readonly roleArn?: string | undefined;
}

/**
 * The ARN the fixture's trigger function has in one region.
 *
 * A suite running in a region of its own names the function with this, because
 * a `LambdaConfig` ARN Cognito accepts is one in the pool's own region.
 */
export function triggerFunctionArnIn(
  regionName: string,
  accountId: string,
): string {
  return (
    `arn:aws:lambda:${regionName}:${accountId}` +
    `:function:${triggerFunctionName}`
  );
}

/**
 * The ARN the fixture's trigger function has.
 *
 * A `LambdaConfig` names the function before the pool exists, so the ARN has to
 * be known before anything is created, which is why it is stated rather than
 * read back off the created function.
 */
export const triggerFunctionArn = triggerFunctionArnIn(
  DEFAULT_SIM_AWS_REGION_NAME,
  DEFAULT_SIM_AWS_ACCOUNT_ID,
);

/**
 * Create the function a pool's `LambdaConfig` names.
 *
 * The function comes first in a real deployment, because the pool names it by
 * ARN, so it comes first here.
 */
export async function makeTriggerFunction(
  simAws: SimAws,
  input: SimCognitoTriggerFunctionInput = {},
): Promise<void> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: triggerFunctionName,
      Role:
        input.roleArn ??
        `arn:aws:iam::${simAws.defaultAccountId}:role/TriggerRole`,
      // A real archive needs the handler naming the module and export the way
      // a deployed function does. A stowed handler function is its own entry
      // point and needs none.
      ...(input.code !== undefined && { Handler: "index.handler" }),
      Code: {
        ZipFile:
          input.code ??
          makeLambdaZipFileInput(input.handler ?? passThroughHandler),
      },
    }),
  );
}

/**
 * Let Cognito invoke the trigger function on one pool's behalf, which is what a
 * CDK `addTrigger` emits an `AWS::Lambda::Permission` for.
 */
export async function permitCognitoTrigger(
  simAws: SimAws,
  userPoolArn: string,
): Promise<void> {
  await simAws.lambda().addPermission(
    new AddPermissionCommand({
      FunctionName: triggerFunctionName,
      StatementId: "AllowCognito",
      Action: "lambda:InvokeFunction",
      Principal: "cognito-idp.amazonaws.com",
      SourceArn: userPoolArn,
    }),
  );
}
