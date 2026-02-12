import { buildApp } from './app';
import { env } from './config/env';
import { logEvent } from './services/telemetry.service';

const app = buildApp();

const start = async (): Promise<void> => {
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });

    await logEvent({
      type: 'server.started',
      payload: { port: env.PORT, env: env.NODE_ENV },
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

void start();
