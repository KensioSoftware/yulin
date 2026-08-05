import { simAwsLocalConfig } from "../local-server/sim-aws-local.config.js";
import { simLiveReloadConfig } from "./sim-live-reload.config.js";

/**
 * Says on startup that live reload is on.
 *
 * Live reload is the one thing the simulator does that changes a response body,
 * which is otherwise the shape the real service returns. Something a served
 * page did not ask for is worth being told about, once, at the point it starts
 * happening, rather than being found later in a page's source.
 *
 * It goes to the console because the simulator has no logger of its own, the
 * same as every other warning it raises.
 */
export class SimLiveReloadReport {
  /**
   * Report live reload on a server that has just started listening.
   */
  announce(port: string): void {
    const channel = `http://${simAwsLocalConfig.hostname}:${port}${simLiveReloadConfig.channelPath}`;

    // eslint-disable-next-line no-console
    console.warn(
      `Simulated AWS live reload is on. HTML responses to browser requests ` +
        `carry a reload script, so those responses are not byte for byte what ` +
        `the real service would return. The reload channel is served at ` +
        `${channel} on every served hostname.`,
    );
  }
}
