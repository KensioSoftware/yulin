import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "./create-function.cmd.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import {
  SimCloudFrontFunction,
  type SimCloudFrontFunctionName,
} from "../../cff/sim-cloudfront-function.js";
import { CffUint8ArrayFunctionCodeExtractor } from "../../cff/function-code-input/cff-function-code-input.js";
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

export type SimCloudFrontFunctionMap = Map<
  SimCloudFrontFunctionName,
  SimCloudFrontFunction
>;

interface CreateFunctionCommandHandlerProps {
  accountId: SimAwsAccountId;
  cloudFrontFunctions?: SimCloudFrontFunctionMap;
  iam?: SimIamInterServiceAuthZ;
  background?: BackgroundScheduler;
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

  constructor(props: CreateFunctionCommandHandlerProps) {
    const {
      accountId,
      cloudFrontFunctions = new Map() as SimCloudFrontFunctionMap,
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = props;
    this.accountId = accountId;
    this.cloudFrontFunctions = cloudFrontFunctions;
    this.authorizer = new CreateFunctionAuthorizer({
      accountId,
      iam,
    });
    this.background = background;
  }

  /**
   * Create a sim CloudFront Function.
   */
  async handle(
    cmd: SimCreateFunctionCommand,
    opts?: CreateFunctionCommandHandlerOptions,
  ): Promise<SimCreateFunctionCommandOutput> {
    assertDefined(cmd.input.Name, "CreateFunctionCommand.input.Name");
    assertDefined(
      cmd.input.FunctionCode,
      "CreateFunctionCommand.input.FunctionCode",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(cmd.input.Name, opts?.caller);

    const handlerFunction = new CffUint8ArrayFunctionCodeExtractor(
      cmd.input.FunctionCode,
    ).extractHandlerFunction();
    const simCff = new SimCloudFrontFunction({
      name: cmd.input.Name,
      accountId: this.accountId,
      handlerFunction,
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
