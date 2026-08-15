import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimElbV2Action } from "../action/sim-elbv2-action.js";
import type { SimElbV2FixedResponseActionConfig } from "../command/sim-elbv2-shared.command.js";
import { simElbV2NullBodyStatuses } from "./sim-elbv2-null-body-statuses.js";

/**
 * Answers a request with a listener or rule's `fixed-response` action.
 *
 * No target is involved and none is needed, which is what makes this the usual
 * way to serve a health endpoint or a maintenance page. The load balancer
 * writes the response itself from what the action holds.
 */
export class SimElbV2FixedResponse {
  /**
   * Build the response one fixed-response action sends.
   */
  respond(action: SimElbV2Action): Response {
    const config = action.fixedResponse;

    // A fixed-response action is created with a configuration and a status
    // code, so a stored one always has both.
    assertDefined(
      config,
      `Simulated ELBv2 fixed-response action holds no FixedResponseConfig`,
    );

    const status = Number(config.StatusCode);

    return new Response(this.body(config, status), {
      status,
      headers: this.headers(config),
    });
  }

  /**
   * The body actually sent, which is nothing for a status that cannot hold
   * one, and for a configuration naming none.
   */
  private body(
    config: SimElbV2FixedResponseActionConfig,
    status: number,
  ): string | null {
    const message = config.MessageBody ?? "";

    if (message === "" || simElbV2NullBodyStatuses.has(status)) {
      return null;
    }

    return message;
  }

  /**
   * The response headers, which are the content type or nothing.
   *
   * Real ELB sends no content type when the action names none, rather than
   * guessing one from the body.
   */
  private headers(config: SimElbV2FixedResponseActionConfig): Headers {
    const headers = new Headers();

    if (config.ContentType !== undefined) {
      headers.set("content-type", config.ContentType);
    }

    return headers;
  }
}
