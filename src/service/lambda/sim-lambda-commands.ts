import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsRunAsOwner } from "../aws/caller/sim-aws-run-as-context.js";
import type { SimSqsPollQueues } from "../sqs/poll/sim-sqs-poll-queues.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimLambdaAliasCommands } from "./command/alias/sim-lambda-alias-commands.js";
import { SimLambdaEventSourceMappingCommands } from "./command/event-source-mapping/sim-lambda-event-source-mapping-commands.js";
import { SimLambdaFunctionCommands } from "./command/function/sim-lambda-function-commands.js";
import { SimLambdaFunctionUrlCommands } from "./command/function-url/sim-lambda-function-url-commands.js";
import { SimLambdaPermissionCommands } from "./command/permission/sim-lambda-permission-commands.js";
import { SimLambdaVersionCommands } from "./command/version/sim-lambda-version-commands.js";
import { SimLambdaEventSourcePollers } from "./event-source/sim-lambda-event-source-pollers.js";
import { SimLambdaNoEventSourceQueues } from "./event-source/queue/sim-lambda-no-event-source-queues.js";
import {
  type SimLambdaEventSourceStreams,
  SimLambdaNoEventSourceStreams,
} from "./event-source/stream/sim-lambda-event-source-streams.js";
import {
  type SimLambdaContainerImages,
  SimLambdaNoContainerImages,
} from "./function/code/image/sim-lambda-container-images.js";
import type { SimLambdaCodeStore } from "./function/code/store/sim-lambda-code-store.js";
import type { SimLambdaVmSdkModuleProvider } from "./function/code/vm/sdk/sim-lambda-vm-sdk-module-provider.js";
import type { SimLogsServiceWriter } from "../logs/write/sim-logs-service-writer.js";
import type { SimLambdaOutboundHttp } from "./function/outbound/sim-lambda-outbound-http.js";
import { SimLambdaEnvironmentConflicts } from "./function/environment/sim-lambda-environment-conflicts.js";
import type { SimLambdaFunctionMap } from "./function/sim-lambda-function.js";
import { SimLambdaFunctionLookup } from "./function/url/sim-lambda-function-lookup.js";
import { SimLambdaFunctionUrlStore } from "./function/url/sim-lambda-function-url-store.js";
import { SimLambdaFunctionAliasStore } from "./function/version/sim-lambda-function-alias-store.js";
import { SimLambdaFunctionVersionStore } from "./function/version/sim-lambda-function-version-store.js";
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
  readonly containerImages?: SimLambdaContainerImages;
  readonly vmSdkModuleProvider?: SimLambdaVmSdkModuleProvider;
  readonly logs?: SimLogsServiceWriter | undefined;
  /**
   * Where the HTTP requests this simulated Lambda's function code makes to
   * hostnames the simulation serves are answered. A standalone SimLambda has
   * no simulated environment to answer them, so its functions reach the
   * network as any other code would.
   */
  readonly outboundHttp?: SimLambdaOutboundHttp;
  readonly urlRegistry?: SimLambdaUrlRegistry;
  readonly eventSourceQueues?: SimSqsPollQueues;
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
  /**
   * Where a container image function's image URI is resolved to a real
   * in-process handler. Read by CloudFormation as well as by CreateFunction,
   * since a template function names an image the same way an SDK caller does.
   */
  public readonly containerImages: SimLambdaContainerImages;

  public readonly functionUrlStore: SimLambdaFunctionUrlStore;
  public readonly versionStore = new SimLambdaFunctionVersionStore();
  public readonly aliasStore = new SimLambdaFunctionAliasStore({
    versions: this.versionStore,
  });
  public readonly functionLookup: SimLambdaFunctionLookup;
  public readonly functions: SimLambdaFunctionCommands;
  public readonly functionUrls: SimLambdaFunctionUrlCommands;
  public readonly permissions: SimLambdaPermissionCommands;
  public readonly versions: SimLambdaVersionCommands;
  public readonly aliases: SimLambdaAliasCommands;
  public readonly eventSourceMappings: SimLambdaEventSourceMappingCommands;

  constructor(properties: SimLambdaCommandsProperties) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      codeStore,
      vmSdkModuleProvider,
      logs,
      outboundHttp,
      // A standalone SimLambda is not reachable over HTTP, so its own registry
      // is enough; a SimAws-created one shares the environment-wide registry
      // the serving layer routes with.
      urlRegistry = new SimLambdaUrlRegistry(),
      // A standalone SimLambda has no simulated SQS or DynamoDB to poll, so an
      // event source mapping made on one is refused rather than never
      // delivering.
      eventSourceQueues = new SimLambdaNoEventSourceQueues(),
      eventSourceStreams = new SimLambdaNoEventSourceStreams(),
      // A standalone SimLambda has no simulated ECR beside it, so a container
      // image function created on one has nothing to resolve its image in.
      containerImages = new SimLambdaNoContainerImages(),
    } = properties;

    this.containerImages = containerImages;

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
    this.versions = new SimLambdaVersionCommands({
      functions: this.functionLookup,
      versions: this.versionStore,
      iam,
      background,
    });
    this.aliases = new SimLambdaAliasCommands({
      functions: this.functionLookup,
      aliases: this.aliasStore,
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
      functionUrls: this.functionUrlStore,
      versions: this.versionStore,
      iam,
      background,
      runAsOwner: properties.runAsOwner,
      // Shared across function creations so a conflicting environment variable
      // is only reported once for this simulated Lambda.
      environmentConflicts: new SimLambdaEnvironmentConflicts(),
      codeStore,
      containerImages,
      vmSdkModuleProvider,
      logs,
      outboundHttp,
    });
  }
}
