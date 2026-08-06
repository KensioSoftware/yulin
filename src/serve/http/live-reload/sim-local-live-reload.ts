import { SimLiveReload } from "./sim-live-reload.js";
import { SimLiveReloadReport } from "./sim-live-reload-report.js";
import {
  simWatch,
  type SimWatchRuntime,
} from "../../../watch/sim-watch-runtime.js";

interface SimLocalLiveReloadProperties {
  readonly enabled: boolean;
  readonly watch?: SimWatchRuntime;
}

/**
 * Live reload as the local server has to hold it: on or off, and wired into the
 * server's own lifecycle either way.
 *
 * Keeping it here leaves `SimAwsLocalServer` with sockets and ports, which is
 * enough for one class, and puts the three things that only matter together in
 * one place: whether it is on, the notice given on startup, and the warning
 * from a `yulin watch` supervisor that the process is about to be replaced.
 */
export class SimLocalLiveReload {
  private readonly liveReload: SimLiveReload | undefined;
  private readonly watch: SimWatchRuntime;

  private readonly onSupervisorStopping = (): void => {
    this.liveReload?.stopping();
  };

  constructor(properties: SimLocalLiveReloadProperties) {
    const { enabled, watch = simWatch } = properties;
    this.liveReload = enabled ? new SimLiveReload() : undefined;
    this.watch = watch;
  }

  /**
   * The channel to hand to the request handler, if there is one.
   */
  channel(): SimLiveReload | undefined {
    return this.liveReload;
  }

  /**
   * Say live reload is on, and start listening for a supervised restart.
   *
   * Under `yulin watch` the process is killed rather than asked to close, so
   * this is where a served page finds out a restart is coming.
   */
  serving(port: string): void {
    if (this.liveReload === undefined) {
      return;
    }

    new SimLiveReloadReport().announce(port);
    this.watch.onStopping(this.onSupervisorStopping);
  }

  /**
   * Tell connected browsers a reload is coming, and stop listening.
   */
  stopping(): void {
    this.watch.offStopping(this.onSupervisorStopping);
    this.liveReload?.stopping();
  }

  /**
   * Reload connected browsers now.
   */
  reload(): void {
    if (this.liveReload === undefined) {
      throw new Error(
        "Live reload is off for this server, serve with { liveReload: true } to use reload()",
      );
    }

    this.liveReload.reload();
  }
}
