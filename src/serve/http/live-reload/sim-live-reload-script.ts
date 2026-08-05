import { simLiveReloadConfig } from "./sim-live-reload.config.js";

/**
 * The script a served page runs to reload itself.
 *
 * It reloads on two signals. An explicit `reload` event is a reload the
 * simulator asked for. A `boot` event carrying an id other than the one this
 * page first saw means it is talking to a process that has restarted, which is
 * how a restart reaches a page without the outgoing and incoming processes
 * having to agree on anything. Reconnecting to the same id, which is what a
 * dropped connection to a still running process gives, does nothing.
 *
 * A `reloading` event says a reload is on its way. The page is left to decide
 * what to make of that, through an attribute it can style, rather than having
 * anything drawn over it.
 */
export const simLiveReloadScript = `(() => {
  if (window.simAwsLiveReload) {
    return;
  }
  window.simAwsLiveReload = true;

  let bootId = null;
  const source = new EventSource("${simLiveReloadConfig.channelPath}");

  source.addEventListener("boot", (event) => {
    if (bootId !== null && bootId !== event.data) {
      window.location.reload();
      return;
    }
    bootId = event.data;
  });

  source.addEventListener("reload", () => {
    window.location.reload();
  });

  source.addEventListener("reloading", () => {
    document.documentElement.dataset.simAwsLiveReload = "reloading";
  });
})();`;

/**
 * The script as it goes into a page.
 */
export const simLiveReloadScriptTag = `<script data-sim-aws-live-reload>${simLiveReloadScript}</script>`;
