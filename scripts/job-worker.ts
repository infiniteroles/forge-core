/**
 * forge-worker entrypoint (Fase 4.3).
 *
 * Runs the detached job worker. Start it with `npm run worker` on the
 * forge-worker service (JOB_WORKER_ENABLED=true). The worker polls queued /
 * stale / reclaimable JobRuns, locks them, runs the stages and heartbeats.
 *
 * It keeps the process alive indefinitely. Logs are minimal and contain no
 * secrets.
 */

import { startJobWorker } from "@/lib/jobs/worker";

// Keeps the Node process alive (the loop alone may not hold the event loop
// while awaiting long jobs).
setInterval(() => {
  /* keep-alive */
}, 1 << 30);

startJobWorker();
