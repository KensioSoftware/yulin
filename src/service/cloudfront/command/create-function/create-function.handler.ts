import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "./create-function.command.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimCloudFrontFunction,
  type SimCloudFrontFunctionName,
} from "../../cff/sim-cloudfront-function.js";
import {
  cffFunctionCodeSource,
  CffUint8ArrayFunctionCodeExtractor,
} from "../../cff/function-code-input/cff-function-code-input.js";
import { cffCloudFrontModule } from "../../cff/kvs/cff-cloudfront-module.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { CreateFunctionAuthorizer } from "./create-function-authorizer.js";
import { CreateFunctionKeyValueStoreAssociation } from "./create-function-kvs-association.js";
import { assertCffCodeWithinSizeLimit } from "./create-function-code-size.js";
import { SimCloudFrontKeyValueStoreRegistry } from "../../key-value-store/sim-cf-key-value-store-registry.js";

export type SimCloudFrontFunctionMap = Map<
  SimCloudFrontFunctionName,
  SimCloudFrontFunction
>;

interface CreateFunctionCommandHandlerProperties {
  accountId: SimAwsAccountId;
  cloudFrontFunctions?: SimCloudFrontFunctionMap;
  iam?: SimIamInterServiceAuthZ;
  background?: BackgroundScheduler;
  keyValueStores?: SimCloudFrontKeyValueStoreRegistry;
}

interface CreateFunctionCommandHandlerOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * Simulated CloudFront CreateFunctionCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudfront/command/CreateFunctionCommand/
 */
export class CreateFunctionCommandHandler implements CommandHandler<
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput
> {
  private readonly accountId: SimAwsAccountId;
  private readonly cloudFrontFunctions: SimCloudFrontFunctionMap;
  private readonly authorizer: CreateFunctionAuthorizer;
  private readonly background: BackgroundScheduler;
  private readonly keyValueStoreAssociation: CreateFunctionKeyValueStoreAssociation;

  constructor(properties: CreateFunctionCommandHandlerProperties) {
    const {
      accountId,
      cloudFrontFunctions = new Map() as SimCloudFrontFunctionMap,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
      keyValueStores = new SimCloudFrontKeyValueStoreRegistry(),
    } = properties;
    this.accountId = accountId;
    this.cloudFrontFunctions = cloudFrontFunctions;
    this.authorizer = new CreateFunctionAuthorizer({
      accountId,
      iam,
    });
    this.background = background;
    this.keyValueStoreAssociation = new CreateFunctionKeyValueStoreAssociation(
      keyValueStores,
    );
  }

  /**
   * Create a sim CloudFront Function.
   */
  async handle(
    command: SimCreateFunctionCommand,
    options?: CreateFunctionCommandHandlerOptions,
  ): Promise<SimCreateFunctionCommandOutput> {
    assertDefined(command.input.Name, "CreateFunctionCommand.input.Name");
    assertDefined(
      command.input.FunctionCode,
      "CreateFunctionCommand.input.FunctionCode",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(command.input.Name, options?.caller);

    assertCffCodeWithinSizeLimit(
      command.input.Name,
      command.input.FunctionCode,
    );

    const keyValueStore = this.keyValueStoreAssociation.resolve(
      command.input.Name,
      command.input.FunctionConfig,
    );

    // The extractor is given the store so that source code running in the vm
    // sandbox gets a `cf` bound to this Function's own association.
    const extractor = new CffUint8ArrayFunctionCodeExtractor(
      command.input.FunctionCode,
      cffCloudFrontModule(keyValueStore),
    );
    const handlerFunction = extractor.extractHandlerFunction();
    const simCff = new SimCloudFrontFunction({
      name: command.input.Name,
      accountId: this.accountId,
      handlerFunction,
      keyValueStore,
      // The config a Function was created with is what every read of it
      // reports, so it is kept rather than only acted on here.
      comment: command.input.FunctionConfig?.Comment,
      runtime: command.input.FunctionConfig?.Runtime,
      functionCode: cffFunctionCodeSource(command.input.FunctionCode),
      createdTime: this.background.now(),
    });

    this.cloudFrontFunctions.set(simCff.name, simCff);

    // New CFF becomes available async in background.
    this.background.schedule(() => simCff.publish());

    return {
      $metadata: {},
      FunctionSummary: {
        Name: simCff.name,
        Status: simCff.status,
      },
      FunctionMetadata: {
        FunctionARN: simCff.arn,
      },
    };
  }
}
