import type { SimRestJsonInput } from "../../../../serve/http/api/rest-json/sim-rest-json-input.js";
import type { SimRestJsonRoute } from "../../../../serve/http/api/rest-json/sim-rest-json-route.type.js";

/**
 * The event source mapping operations this endpoint serves.
 *
 * Creating and listing answer at the collection, and reading and deleting at
 * one mapping's own UUID.
 */
export const simLambdaEventSourceApiRoutes: readonly SimRestJsonRoute[] = [
  {
    method: "POST",
    path: "/2015-03-31/event-source-mappings",
    commandName: "CreateEventSourceMappingCommand",
    status: 202,
    input: createEventSourceMappingInput,
  },
  {
    method: "GET",
    path: "/2015-03-31/event-source-mappings",
    commandName: "ListEventSourceMappingsCommand",
    input: (input) => ({
      EventSourceArn: input.query("EventSourceArn"),
      FunctionName: input.query("FunctionName"),
    }),
  },
  {
    method: "GET",
    path: "/2015-03-31/event-source-mappings/{UUID}",
    commandName: "GetEventSourceMappingCommand",
    input: (input) => ({ UUID: input.label("UUID") }),
  },
  {
    method: "DELETE",
    path: "/2015-03-31/event-source-mappings/{UUID}",
    commandName: "DeleteEventSourceMappingCommand",
    status: 202,
    input: (input) => ({ UUID: input.label("UUID") }),
  },
];

/**
 * Read a mapping to create, whose members are all in the body.
 *
 * Everything the request stated is passed on, including the members this
 * simulation refuses, so a mapping asking for behaviour it does not have is
 * refused here as it is in process rather than created without it.
 *
 * `StartingPositionTimestamp` is the one member that has to be turned back
 * into what the simulation expects: JSON carries a timestamp as epoch seconds,
 * and a starting position is compared against dates.
 */
function createEventSourceMappingInput(
  input: SimRestJsonInput,
): Record<string, unknown> {
  const members = input.json();
  const startingPosition = members["StartingPositionTimestamp"];

  return typeof startingPosition === "number"
    ? {
        ...members,
        StartingPositionTimestamp: new Date(startingPosition * 1000),
      }
    : { ...members };
}
