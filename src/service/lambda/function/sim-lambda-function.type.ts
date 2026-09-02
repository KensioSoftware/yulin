import type { Brand } from "../../../util/brand.type.js";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsRunAsOwner } from "../../aws/caller/sim-aws-run-as-context.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCloudWatchServiceWriter } from "../../cloudwatch/write/sim-cloudwatch-service-writer.js";
import type { SimLambdaOutput } from "./logging/sim-lambda-output.js";
import type { SimLogsServiceWriter } from "../../logs/write/sim-logs-service-writer.js";
import type { SimLambdaExecutableCode } from "./code/sim-lambda-executable-code.js";
import type { SimLambdaEnvironment } from "./environment/sim-lambda-environment.js";
import type { SimLambdaOutboundHttp } from "./outbound/sim-lambda-outbound-http.js";
import type { SimLambdaFunctionState } from "./sim-lambda-function-configuration.js";
import type { SimLambdaHandler } from "./sim-lambda-handler.type.js";
import type { SimLambdaFunction } from "./sim-lambda-function.js";

export type SimLambdaFunctionName = Brand<string, "SimLambdaFunctionName">;

export type SimLambdaFunctionMap = Map<
  SimLambdaFunctionName,
  SimLambdaFunction
>;

export interface SimLambdaFunctionProperties {
  name: SimLambdaFunctionName | string;
  roleArn: string;
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  handlerFunction?: SimLambdaHandler;
  code?: SimLambdaExecutableCode | undefined;
  state?: SimLambdaFunctionState;
  handlerName?: string | undefined;
  runtimeName?: string | undefined;
  description?: string | undefined;
  timeoutSeconds?: number | undefined;
  memorySizeMb?: number | undefined;
  environment?: SimLambdaEnvironment | undefined;
  /**
   * The queue or topic this function's abandoned asynchronous events are sent
   * to, which is what `DeadLetterConfig.TargetArn` names.
   */
  deadLetterTargetArn?: string | undefined;
  runAsOwner?: SimAwsRunAsOwner;
  /**
   * The version this is. A function is `$LATEST`, and a version published
   * from one is a copy of it under the number it was published as.
   */
  version?: string | undefined;
  /**
   * Clock this function's invocations measure their remaining time against. A
   * function built standalone, outside a SimAws instance, falls back to the
   * real clock.
   */
  clock?: SimClock | undefined;
  /**
   * Where this function's handler output is recorded. A function built
   * standalone, outside a SimAws instance, has nowhere to record to and writes
   * only to the host streams.
   */
  logs?: SimLogsServiceWriter | undefined;
  /**
   * Where this function's output goes besides its log group, shared with every
   * other function of the same simulated Lambda. A function built standalone
   * gets settings of its own, which nothing else can reach and which leave the
   * host console printing.
   */
  output?: SimLambdaOutput | undefined;
  /**
   * Where this function's invocations are counted. A function built
   * standalone, outside a SimAws instance, has no simulated CloudWatch to
   * publish `AWS/Lambda` metrics into and counts nothing.
   */
  metrics?: SimCloudWatchServiceWriter | undefined;
  /**
   * Where the HTTP requests this function's code makes to hostnames the
   * simulation serves are answered. A function built standalone, outside a
   * SimAws instance, has no simulation to answer them and reaches the network
   * as any other code would.
   */
  outboundHttp?: SimLambdaOutboundHttp | undefined;
}
