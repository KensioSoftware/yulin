import type {
  JSONObject,
  JSONValue,
} from "../../../../util/type-guard/json.js";
import type { SimStatesService } from "./sim-states-service-name.js";

/**
 * What one of the optimized integrations does to the request and the result,
 * where the shape it defines is not the API's own.
 */
export interface SimStatesServiceShape {
  readonly request?: (parameters: JSONObject) => JSONObject;
  readonly answer?: (result: JSONValue) => JSONValue;
}

/**
 * The call a `Task` state's `Resource` resolved to.
 */
export interface SimStatesServiceCall {
  readonly service: SimStatesService;

  /**
   * The operation as the API writes it, and what a refusal names.
   */
  readonly operation: string;

  /**
   * The SDK Command the operation is, and what the simulated service routes
   * on.
   */
  readonly commandName: string;

  readonly shape?: SimStatesServiceShape;
}
