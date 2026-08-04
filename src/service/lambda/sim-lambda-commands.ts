import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsRunAsOwner } from "../aws/caller/sim-aws-run-as-context.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaEventSourceMappingCommands } from "./command/event-source-mapping/sim-lambda-event-source-mapping-commands.js";
import { SimLambdaFunctionCommands } from "./command/function/sim-lambda-function-commands.js";
import { SimLambdaFunctionUrlCommands } from "./command/function-url/sim-lambda-function-url-commands.js";
import { SimLambdaPermissionCommands } from "./command/permission/sim-lambda-permission-commands.js";
import { SimLambdaEventSourcePollers } from "./event-source/sim-lambda-event-source-pollers.js";
import {
  type SimLambdaEventSourceQueues,
  SimLambdaNoEventSourceQueues,
} from "./event-source/queue/sim-lambda-event-source-queues.js";
import {
  type SimLambdaEventSourceStreams,
  SimLambdaNoEventSourceStreams,
} from "./event-source/stream/sim-lambda-event-source-streams.js";
import type { SimLambdaCodeStore } from "./function/code/store/sim-lambda-code-store.js";
import type { SimLambdaVmSdkModuleProvider } from "./function/code/vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import { SimLambdaEnvironmentConflicts } from "./function/environment/sim-lambda-environment-conflicts.js";
import type { SimLambdaFunctionMap } from "./function/sim-lambda-function.js";
import { SimLambdaFunctionLookup } from "./function/url/sim-lambda-function-lookup.js";
import { SimLambdaFunctionUrlStore } from "./function/url/sim-lambda-function-url-store.js";
import { SimLambdaUrlRegistry } from "./registry/sim-lambda-url-registry.js";

/**
 * How one simulated Lambda is put together.
 */
export interface SimLambdaProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
  readonly runAsOwner?: SimAwsRunAsOwner;
  readonly codeStore?: SimLambdaCodeStore;
  readonly vmSdkModuleProvider?: SimLambdaVmSdkModuleProvider;
  readonly urlRegistry?: SimLambdaUrlRegistry;
  readonly eventSourceQueues?: SimLambdaEventSourceQueues;
  readonly eventSourceStreams?: SimLambdaEventSourceStreams;
}

interface SimLambdaCommandsProperties extends SimLambdaProperties {
  readonly functions: SimLambdaFunctionMap;
  readonly runAsOwner: SimAwsRunAsOwner;
}

/**
 * The command areas of one simulated Lambda, and the state they share.
 *
 * The wiring lives here rather than in the SimLambda constructor so the service
 * facade stays what it is meant to be: state and delegation. Each area is
 * grouped by the collaborators it shares, so a command's own handler is reached
 * through the area it belongs to.
 */
export class SimLambdaCommands {
  public readonly functionUrlStore: SimLambdaFunctionUrlStore;
  public readonly functionLookup: SimLambdaFunctionLookup;
  public readonly functions: SimLambdaFunctionCommands;
  public readonly functionUrls: SimLambdaFunctionUrlCommands;
  public readonly permissions: SimLambdaPermissionCommands;
  public readonly eventSourceMappings: SimLambdaEventSourceMappingCommands;

  constructor(properties: SimLambdaCommandsProperties) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      codeStore,
      vmSdkModuleProvider,
      // A standalone SimLambda is not reachable over HTTP, so its own registry
      // is enough; a SimAws-created one shares the environment-wide registry
      // the serving layer routes with.
      urlRegistry = new SimLambdaUrlRegistry(),
      // A standalone SimLambda has no simulated SQS or DynamoDB to poll, so an
      // event source mapping made on one is refused rather than never
      // delivering.
      eventSourceQueues = new SimLambdaNoEventSourceQueues(),
      eventSourceStreams = new SimLambdaNoEventSourceStreams(),
    } = properties;

    this.functionLookup = new SimLambdaFunctionLookup({
      accountRegionScope,
      functions: properties.functions,
    });
    this.functionUrlStore = new SimLambdaFunctionUrlStore({
      accountRegionScope,
      urlRegistry,
      clock: background,
    });
    this.functionUrls = new SimLambdaFunctionUrlCommands({
      functionUrls: this.functionUrlStore,
      functions: this.functionLookup,
      iam,
      background,
    });
    this.permissions = new SimLambdaPermissionCommands({
      functions: this.functionLookup,
      iam,
      background,
    });
    this.eventSourceMappings = new SimLambdaEventSourceMappingCommands({
      accountRegionScope,
      pollers: new SimLambdaEventSourcePollers({
        functions: this.functionLookup,
        queues: eventSourceQueues,
        streams: eventSourceStreams,
        background,
      }),
      queues: eventSourceQueues,
      streams: eventSourceStreams,
      functions: this.functionLookup,
      iam,
      background,
    });
    this.functions = new SimLambdaFunctionCommands({
      accountRegionScope,
      functions: properties.functions,
      iam,
      background,
      runAsOwner: properties.runAsOwner,
      // Shared across function creations so a conflicting environment variable
      // is only reported once for this simulated Lambda.
      environmentConflicts: new SimLambdaEnvironmentConflicts(),
      codeStore,
      vmSdkModuleProvider,
    });
  }
}
