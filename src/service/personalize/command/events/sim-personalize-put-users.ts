import { SimPersonalizeRecordedUser } from "../../event/sim-personalize-recorded-user.js";
import { SimPersonalizeUnsimulatedInput } from "../sim-personalize-unsimulated-input.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimPutUsersCommand,
  SimPutUsersCommandOutput,
} from "./events.command.js";
import { SimPersonalizeEventCommandGroup } from "./sim-personalize-event-command-group.js";
import {
  readSimPersonalizeProperties,
  requireSimPersonalizeBatch,
  requireSimPersonalizeField,
} from "./sim-personalize-event-input.js";

const action = "personalize:PutUsers";

const accepted = ["datasetArn", "users"];

const acceptedUser = ["userId", "properties"];

const unsimulated = new SimPersonalizeUnsimulatedInput("PutUsers");

/**
 * Handles a PutUsers command.
 *
 * It follows PutItems. The users are recorded and read back through
 * `personalize().recordedUsers()`, and the Users dataset stays empty.
 */
export class SimPersonalizePutUsersHandler extends SimPersonalizeEventCommandGroup {
  /**
   * Record the users a request carries.
   */
  handle(
    command: SimPutUsersCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimPutUsersCommandOutput {
    const { input } = command;

    unsimulated.refuseUnaccepted(input, accepted);

    const dataset = this.datasetOfType(
      input.datasetArn,
      "USERS",
      action,
      options,
    );
    const users = requireSimPersonalizeBatch(input.users, "users");
    const recordedAt = this.clock.now();

    this.records.addUsers(
      users.map((user) => {
        unsimulated.refuseUnaccepted(user, acceptedUser);

        return new SimPersonalizeRecordedUser({
          datasetArn: dataset.arn,
          userId: requireSimPersonalizeField(user.userId, "userId"),
          properties: readSimPersonalizeProperties(user.properties),
          recordedAt,
        });
      }),
    );

    return { $metadata: {} };
  }
}
