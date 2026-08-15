import type {
  SimElbV2ActionInput,
  SimElbV2ActionView,
  SimElbV2FixedResponseActionConfig,
  SimElbV2RedirectActionConfig,
} from "../command/sim-elbv2-shared.command.js";
import {
  SimElbV2UnsimulatedInputException,
  SimElbV2ValidationError,
} from "../error/sim-elbv2.error.js";
import { requireSimElbV2FixedResponseConfig } from "./sim-elbv2-fixed-response-config.js";
import { requireSimElbV2RedirectConfig } from "./sim-elbv2-redirect-config.js";

/**
 * The action types an Application Load Balancer listener or rule can hold
 * here.
 *
 * Real ALB also has `authenticate-oidc` and `authenticate-cognito`, which sit
 * in front of the request and speak to an identity provider. Nothing in this
 * simulation performs that exchange, so an action naming one is refused rather
 * than treated as a forward that quietly skips authentication.
 */
const simulatedActionTypes = new Set(["forward", "fixed-response", "redirect"]);

/**
 * The target groups a forward action names, whichever form it names them in.
 */
function forwardTargetGroupArns(input: SimElbV2ActionInput): readonly string[] {
  const tupleArns = (input.ForwardConfig?.TargetGroups ?? [])
    .map((tuple) => tuple.TargetGroupArn)
    .filter((arn) => arn !== undefined);

  if (input.TargetGroupArn === undefined) {
    return tupleArns;
  }

  return [input.TargetGroupArn, ...tupleArns];
}

/**
 * One action on a simulated listener or listener rule.
 *
 * Actions are held rather than performed: choosing one and answering a request
 * with it is a separate piece of work. What this class owns is that an action
 * stored here is one a real load balancer would have accepted, so a listener
 * that was created is a listener that could route.
 */
export class SimElbV2Action {
  public readonly type: string;
  public readonly order: number | undefined;
  public readonly targetGroupArns: readonly string[];

  private readonly input: SimElbV2ActionInput;

  private constructor(input: SimElbV2ActionInput, type: string) {
    // Copied, so that a caller mutating the command input it sent cannot
    // change where a listener or rule forwards afterwards. Real ELB reads the
    // request off the wire, and nothing a caller does to its own objects
    // reaches it.
    this.input = structuredClone(input);
    this.type = type;
    this.order = input.Order;
    this.targetGroupArns = forwardTargetGroupArns(input);
  }

  /**
   * Read the actions a request carries, refusing a list ELB would not take.
   *
   * Real ELB takes exactly one routing action, last in the list, and the only
   * thing that may come before it is an authentication action. None of those
   * is simulated, so every action here is a routing action, and a list holding
   * more than one names two places for the same request to go.
   */
  static readAll(
    actions: readonly SimElbV2ActionInput[] | undefined,
    field: string,
  ): readonly SimElbV2Action[] {
    if (actions === undefined || actions.length === 0) {
      throw new SimElbV2ValidationError(
        `${field} must hold at least one action`,
      );
    }

    if (actions.length > 1) {
      throw new SimElbV2ValidationError(
        `${field} holds ${String(actions.length)} actions, and a listener or ` +
          `rule takes one routing action. The authentication actions that can ` +
          `precede it are not simulated.`,
      );
    }

    return actions.map((action) => this.read(action, field));
  }

  /**
   * Read one action, refusing a type or configuration ELB would not take.
   */
  static read(input: SimElbV2ActionInput, field: string): SimElbV2Action {
    const type = input.Type;

    if (type === undefined || type === "") {
      throw new SimElbV2ValidationError(`${field} action requires a Type`);
    }

    if (!simulatedActionTypes.has(type)) {
      throw new SimElbV2UnsimulatedInputException(
        `${field} action type '${type}' is not simulated. Simulated action ` +
          `types are ${[...simulatedActionTypes].join(", ")}.`,
      );
    }

    const action = new SimElbV2Action(input, type);

    action.validate(field);

    return action;
  }

  /** What a fixed-response action answers with. */
  get fixedResponse(): SimElbV2FixedResponseActionConfig | undefined {
    return this.input.FixedResponseConfig;
  }

  /** Where a redirect action sends the client. */
  get redirect(): SimElbV2RedirectActionConfig | undefined {
    return this.input.RedirectConfig;
  }

  /**
   * Report this action in the shape the SDK reads it back in.
   */
  view(): SimElbV2ActionView {
    return {
      Type: this.type,
      Order: this.order,
      TargetGroupArn: this.input.TargetGroupArn,
      ForwardConfig: this.input.ForwardConfig,
      FixedResponseConfig: this.input.FixedResponseConfig,
      RedirectConfig: this.input.RedirectConfig,
    };
  }

  private validate(field: string): void {
    if (this.type === "forward") {
      this.validateForward(field);
      return;
    }

    if (this.type === "fixed-response") {
      requireSimElbV2FixedResponseConfig(this.fixedResponse, field);
      return;
    }

    requireSimElbV2RedirectConfig(this.redirect, field);
  }

  private validateForward(field: string): void {
    if (this.targetGroupArns.length === 0) {
      throw new SimElbV2ValidationError(
        `${field} forward action requires a TargetGroupArn or a ` +
          `ForwardConfig naming at least one target group`,
      );
    }
  }
}
