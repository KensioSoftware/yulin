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

  // The supervisor has its own handshake for waiting: it holds off killing the
  // process until this one says it has stopped, which it does once the
  // listeners have run. So the writes go out here and nothing waits on them.
  private readonly onSupervisorStopping = (): void => {
    void this.liveReload?.stopping();
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
   *
   * Resolves once those browsers have had it, so the server can go on to
   * destroy what is left of its connections.
   */
  async stopping(): Promise<void> {
    this.watch.offStopping(this.onSupervisorStopping);
    await this.liveReload?.stopping();
  }

  /**
   * Reload connected browsers now.
   */
  reload(): void {
    this.reloadChannel().reload();
  }

  /**
   * Give now the refusal a reload would be given later, if there is one.
   *
   * For anything handed this server to reload for it, such as a watched
   * template file. A server serving without live reload can never reload, and
   * the refusal is worth having where the mistake was made rather than on the
   * first change, long after.
   */
  checkReload(): void {
    this.reloadChannel();
  }

  private reloadChannel(): SimLiveReload {
    if (this.liveReload === undefined) {
      throw new Error(
        "Live reload is off for this server, serve with { liveReload: true } to use reload()",
      );
    }

    return this.liveReload;
  }
}
