import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import type { SamTemplateApiAuth } from "../../api/auth/sim-cfn-sam-template-api-auth.js";
import { isSamTemplateRecord } from "../../sim-cfn-sam-record.js";
import { samConditionAttribute } from "../sim-cfn-sam-function-properties.js";

/**
 * What the expansion of a SAM function is asked about its events.
 */
export interface SamFunctionEventsProperties {
  /** The logical ID of the SAM function whose events these are. */
  readonly logicalId: string;
  /** The function properties, with the `Globals` defaults already merged in. */
  readonly functionProperties: SimCfnTemplateValueRecord;
  /**
   * The `Globals.Api` defaults the template states, for the events that make
   * an API of their own.
   */
  readonly apiGlobals: SimCfnTemplateValueRecord;
  /**
   * The `Auth` of every API of the template, for the events that put a method
   * or a route on one.
   */
  readonly apiAuth: SamTemplateApiAuth;
  /** The `Condition` the SAM Resource carried, where it carried one. */
  readonly condition: SimCfnTemplateValue | undefined;
}

/**
 * What an expansion is told about the event it is expanding.
 */
export interface SamFunctionEvent {
  /**
   * The logical ID of the SAM function the event is declared on, which is also
   * the logical ID of the Lambda function it is expanded into.
   */
  readonly functionLogicalId: string;
  /** The name the function declared the event under in `Events`. */
  readonly eventName: string;
  /**
   * The `Properties` of the event. An event stating none states an empty
   * record.
   */
  readonly properties: SimCfnTemplateValueRecord;
  /**
   * The `Condition` attribute to put on the Resources that exist only because
   * this function does, ready to spread. A function carrying no condition
   * supplies nothing.
   */
  readonly condition: SimCfnTemplateValueRecord;
  /**
   * The `Globals.Api` defaults the template states. An `Api` event naming no
   * `RestApiId` makes the implicit API, and SAM gives that API the same
   * defaults as one the template declared.
   */
  readonly apiGlobals: SimCfnTemplateValueRecord;
  /**
   * The `Auth` of every API of the template, by the logical ID each is expanded
   * under. An `Api` or `HttpApi` event reads the one belonging to the API it
   * names, to say how the method or route it expands into is authorized.
   */
  readonly apiAuth: SamTemplateApiAuth;
}

/**
 * One event of a function, as the expansion tables are asked about it.
 */
export interface SamDeclaredEvent {
  /** The name the event wrote under `Type`. */
  readonly type: string;
  readonly event: SamFunctionEvent;
}

/**
 * The events a function declares, as the expansion tables are told about them.
 *
 * An event this cannot read at all, or one naming no `Type`, is left out. The
 * function deploys with nothing in front of it rather than the deployment
 * failing over an event nothing reads.
 */
export function samDeclaredEvents(
  properties: SamFunctionEventsProperties,
): readonly SamDeclaredEvent[] {
  const events = properties.functionProperties["Events"];

  if (!isSamTemplateRecord(events)) {
    return [];
  }

  return Object.entries(events).flatMap(([eventName, event]) =>
    declaredEvent(properties, eventName, event),
  );
}

function declaredEvent(
  properties: SamFunctionEventsProperties,
  eventName: string,
  event: SimCfnTemplateValue,
): readonly SamDeclaredEvent[] {
  if (!isSamTemplateRecord(event)) {
    return [];
  }

  const type = event["Type"];

  if (typeof type !== "string") {
    return [];
  }

  const eventProperties = event["Properties"];

  return [
    {
      type,
      event: {
        functionLogicalId: properties.logicalId,
        eventName,
        properties: isSamTemplateRecord(eventProperties) ? eventProperties : {},
        condition: samConditionAttribute(properties.condition),
        apiGlobals: properties.apiGlobals,
        apiAuth: properties.apiAuth,
      },
    },
  ];
}
