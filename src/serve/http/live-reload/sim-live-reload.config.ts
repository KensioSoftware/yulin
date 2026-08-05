/**
 * Configuration for the live reload channel served on localhost.
 */
export const simLiveReloadConfig = {
  // Reserved on every served hostname, so the injected script can ask for it
  // with a relative path whatever host the page was served from. The cost is
  // that a simulated distribution cannot serve anything at this path while live
  // reload is on.
  channelPath: "/__sim-aws/live-reload",
  // How soon a browser reconnects after the connection drops. The default is
  // several seconds, which is the gap between a restarted process being ready
  // and the page noticing.
  clientRetryMs: 500,
};

/**
 * Reports that a response carries the injected live reload script.
 */
export const simLiveReloadHeaderName = "x-sim-aws-live-reload";
