import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "./create-function.cmd.js";
import { jitter } from "../../../../util/sleep.js";
import { assertDefined } from "../../../../util/defined/defined.js";
import {
  SimCloudFrontFunction,
  type SimCloudFrontFunctionName,
} from "../../cff/sim-cloudfront-function.js";
import { CffUint8ArrayFunctionCodeExtractor } from "../../cff/function-code-input/cff-function-code-input.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";

export type SimCloudFrontFunctionMap = Map<
  SimCloudFrontFunctionName,
  SimCloudFrontFunction
>;

interface CreateFunctionCommandHandlerProps {
  cloudFrontFunctions?: SimCloudFrontFunctionMap;
  background?: BackgroundScheduler;
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
  private readonly cloudFrontFunctions: SimCloudFrontFunctionMap;
  private readonly background: BackgroundScheduler;

  constructor(props: CreateFunctionCommandHandlerProps = {}) {
    const {
      cloudFrontFunctions = new Map() as SimCloudFrontFunctionMap,
      background = new BackgroundTasks(),
    } = props;
    this.cloudFrontFunctions = cloudFrontFunctions;
    this.background = background;
  }

  /**
   * Create a sim CloudFront Function.
   */
  async handle(
    cmd: SimCreateFunctionCommand,
  ): Promise<SimCreateFunctionCommandOutput> {
    assertDefined(cmd.input.Name, "CreateFunctionCommand.input.Name");
    assertDefined(
      cmd.input.FunctionCode,
      "CreateFunctionCommand.input.FunctionCode",
    );

    await jitter();

    const handlerFunction = new CffUint8ArrayFunctionCodeExtractor(
      cmd.input.FunctionCode,
    ).extractHandlerFunction();
    const simCff = new SimCloudFrontFunction({
      name: cmd.input.Name,
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
