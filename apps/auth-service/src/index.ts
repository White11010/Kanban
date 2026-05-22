import { prisma } from "./db.js";
import { redis } from "./redis.js";
import { buildServer } from "./app.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  const app = await buildServer();

  try {
    await prisma.$connect();
    app.log.info("PostgreSQL connected (kanban_auth)");
  } catch (err) {
    app.log.error({ err }, "PostgreSQL connection failed");
    process.exit(1);
  }

  try {
    await redis.connect();
    await redis.ping();
    app.log.info("Redis connected");
  } catch (err) {
    app.log.error({ err }, "Redis connection failed");
    process.exit(1);
  }

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Swagger UI:    http://localhost:${PORT}/docs`);
    app.log.info(`Health check:  http://localhost:${PORT}/health`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
