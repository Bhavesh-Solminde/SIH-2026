import { createApp } from "./app.js";
import { startMpcbSyncJob } from "./lib/mpcb-sync.js";

const port = Number(process.env.PORT ?? 4000);
// 0.0.0.0, not localhost: the phone reaches this over the hotspot, and a
// loopback bind is the single most common reason the demo device sees nothing.
createApp().listen(port, "0.0.0.0", () => {
  console.log(`bhaav api listening on http://0.0.0.0:${port}`);
  startMpcbSyncJob();
});
