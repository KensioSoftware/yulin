/*
 * The three places a bucket can send an event, and what each of them is called
 * in the request a notification configuration becomes.
 *
 * Reading a plan means reading records whose keys come from the document
 * rather than from this code, so the object-injection rule fires on every
 * lookup. The records are parsed JSON with no prototype of their own.
 */
// oxlint-disable security/detect-object-injection
import type { SimCfnTemplateValue } from "../../service/cloudformation/template/value/sim-cfn-template-value.js";
import {
  blocks,
  field,
  properties,
  type TerraformMappingContext,
} from "../sim-tf-attributes.js";
import { blockAttribute } from "../sim-tf-nested-attributes.js";
import {
  notificationDestinations,
  type NotificationDestination,
} from "./sim-tf-map-s3-notification.js";
import {
  notificationKeyFilter,
  notificationText,
} from "./sim-tf-map-s3-notification-filter.js";

/** Every destination the bucket sends to, grouped by the service it names. */
export function notificationConfiguration(
  context: TerraformMappingContext,
): SimCfnTemplateValue | undefined {
  const configuration = properties(
    Object.fromEntries(
      notificationDestinations.map((destination) => [
        destination.property,
        entries(context, destination),
      ]),
    ),
  );

  return Object.keys(configuration).length === 0 ? undefined : configuration;
}

/** One destination's entries, each naming the events it wants. */
function entries(
  context: TerraformMappingContext,
  destination: NotificationDestination,
): SimCfnTemplateValue | undefined {
  const declared = blocks(context, destination.block).flatMap(
    (entry, index) => {
      const arn = blockAttribute(
        context,
        destination.block,
        index,
        destination.destination,
      );

      return arn === undefined
        ? []
        : [
            properties({
              Id: notificationText(entry, "id"),
              [destination.arn]: arn,
              Events: field(entry, "events") as SimCfnTemplateValue,
              Filter: notificationKeyFilter(entry),
            }),
          ];
    },
  );

  return declared.length === 0 ? undefined : declared;
}
