/**
 * Configuration shared by `yulin watch` and the process it supervises.
 */
export const simWatchConfig = {
  // Set on a supervised process, so the runtime in it knows there is a
  // supervisor to talk to. Absent everywhere else, which is what makes watch
  // mode inert unless it was asked for.
  environmentVariableName: "YULIN_WATCH",
  environmentVariableValue: "1",
  // How long a burst of writes has to go quiet before it counts as one change.
  // One save from an editor is several writes, and a rename over the original.
  settleMs: 120,
  // How long the supervisor waits for a process to say it has told its browsers
  // a reload is coming. A process not running Yulin's runtime never answers, so
  // this is a short wait rather than a requirement.
  stoppingMs: 250,
  // How long a process gets to exit on its own before it is killed outright.
  exitMs: 2000,
  // A change arriving sooner than this after a start is a change the process
  // itself is likely to have made.
  selfInflictedMs: 1500,
  // How many self-inflicted restarts in a row before the loop is called.
  loopRestarts: 3,
};

/**
 * The messages the supervisor and the supervised process send each other.
 */
export const simWatchMessages = {
  // Child to parent: a path Yulin is reading that is worth watching.
  path: "yulin:watch-path",
  // Child to parent: a path Yulin is watching itself and answering in place, so
  // a change to it is not something to restart the process for.
  heldPath: "yulin:watch-held-path",
  // Parent to child: this process is about to be restarted.
  stopping: "yulin:watch-stopping",
  // Child to parent: the browsers have been told, go ahead.
  stopped: "yulin:watch-stopped",
} as const;
