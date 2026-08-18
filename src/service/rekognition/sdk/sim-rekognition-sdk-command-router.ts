import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimCreateCollectionCommand,
  SimDeleteCollectionCommand,
  SimListCollectionsCommand,
} from "../command/collection/collection.command.js";
import type { SimDetectFacesCommand } from "../command/detect-faces/detect-faces.command.js";
import type { SimDetectLabelsCommand } from "../command/detect-labels/detect-labels.command.js";
import type { SimDetectModerationLabelsCommand } from "../command/detect-moderation-labels/detect-moderation-labels.command.js";
import type { SimRekognition } from "../sim-rekognition.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Rekognition
 * instance.
 */
export class SimRekognitionSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simRekognition: SimRekognition) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateCollectionCommand",
        async (command, context): Promise<unknown> =>
          await simRekognition.createCollection(
            command as SimCreateCollectionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListCollectionsCommand",
        async (command, context): Promise<unknown> =>
          await simRekognition.listCollections(
            command as SimListCollectionsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteCollectionCommand",
        async (command, context): Promise<unknown> =>
          await simRekognition.deleteCollection(
            command as SimDeleteCollectionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DetectModerationLabelsCommand",
        async (command, context): Promise<unknown> =>
          await simRekognition.detectModerationLabels(
            command as SimDetectModerationLabelsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DetectLabelsCommand",
        async (command, context): Promise<unknown> =>
          await simRekognition.detectLabels(
            command as SimDetectLabelsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DetectFacesCommand",
        async (command, context): Promise<unknown> =>
          await simRekognition.detectFaces(
            command as SimDetectFacesCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Rekognition can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Rekognition supports
   * it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}
