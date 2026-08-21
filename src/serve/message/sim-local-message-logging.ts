import type { SimAws } from "../../service/aws/sim-aws.js";
import type { SimAwsMessageUnlisten } from "../../service/aws/message/sim-aws-message-log.js";
import {
  SimMessageLogConsole,
  type SimMessageConsole,
} from "./sim-message-log-console.js";
import {
  SimMessageLogging,
  type SimMessageLoggingOption,
} from "./sim-message-logging.js";

interface SimLocalMessageLoggingProperties {
  readonly simAws: SimAws;
  readonly option?: SimMessageLoggingOption | undefined;

  /**
   * Where the lines go. The process console unless a test wants to read them.
   */
  readonly target?: SimMessageConsole | undefined;
}

/**
 * Message logging as the local server has to hold it: which kinds are printed,
 * and wired into the server's own lifecycle.
 *
 * Keeping it here leaves `SimAwsLocalServer` with sockets and ports, the same
 * split live reload gets. The listener goes on when the server starts serving
 * and comes off when it closes, so a message recorded before or after reaches
 * no console.
 */
export class SimLocalMessageLogging {
  private readonly simAws: SimAws;
  private readonly logging: SimMessageLogging;
  private readonly output: SimMessageLogConsole;

  #unlisten: SimAwsMessageUnlisten | undefined;

  constructor(properties: SimLocalMessageLoggingProperties) {
    this.simAws = properties.simAws;
    this.logging = new SimMessageLogging(properties.option);
    this.output = new SimMessageLogConsole(properties.target);
  }

  /**
   * Start printing the messages this environment records.
   *
   * A server asked for no kinds at all listens to nothing.
   */
  serving(): void {
    if (!this.logging.any) {
      return;
    }

    this.#unlisten = this.simAws.serviceFactory.messageLog.listen((message) => {
      if (this.logging.prints(message.kind)) {
        this.output.print(message);
      }
    });
  }

  /**
   * Stop printing.
   */
  stopping(): void {
    this.#unlisten?.();
    this.#unlisten = undefined;
  }
}
