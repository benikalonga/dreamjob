import { createApp } from './app';
import { config } from './config';
import { tick } from './services/jobs';

const server = createApp().listen(config.port, () => console.log(`DreamJob API listening on port ${config.port}`));
const timer = setInterval(tick, 60_000);

function shutdown() {
  clearInterval(timer);
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
