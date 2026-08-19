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
  //
  // The number is what a real build needs rather than what one save needs.
  // macOS hands a recursive watch its events in waves rather than one at a
  // time: a build writing several thousand files was measured arriving as tens
  // of waves up to 49ms apart, so a window near that turns one build into
  // several restarts, and 120 was close enough to it to be split by a build
  // that pauses between its own phases. 250 clears the waves several times
  // over, and covers the short pauses a multi-stage build takes. It is also
  // well inside `selfInflictedMs`, so a file the process wrote on startup is
  // still recognised as one it wrote itself.
  settleMs: 250,
  // How long a burst is allowed to defer the change that started it. Every
  // event pushes the settle window back, so without this a build that writes
  // for a minute is acted on a minute late, having held everything off for the
  // whole of it.
  //
  // Longer than `selfInflictedMs`, so a change taken during a burst is never
  // mistaken for one the process made itself, and longer than an ordinary build
  // takes, so it is a backstop for a stream that will not stop rather than
  // something a build runs into.
  settleMaxWaitMs: 5000,
  // How often a watched file's metadata is read, behind the events for it.
  // macOS delivers a process's filesystem events over one FSEvents stream,
  // which libuv rebuilds whenever any watch in the process starts or stops, and
  // a write that lands during the rebuild reaches nothing. Reading the file
  // says the same thing without depending on the stream.
  //
  // Well inside `settleMs`, so an event and a read noticing the same save fall
  // in one burst and are one change rather than two. That is also what it costs:
  // a read landing inside the window pushes the window back, so a save the
  // events did report is acted on up to one interval later than it would be.
  filePollMs: 100,
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
