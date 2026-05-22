import { authRoutes } from "./routes/auth.routes.js";
import { prisma } from "./db.js";
import { redis } from "./redis.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

export async function buildServer() {
  const isProd = process.env.NODE_ENV === "production";

  const app = Fastify({
    logger: isProd
      ? { level: process.env.LOG_LEVEL ?? "info" }
      : {
          level: process.env.LOG_LEVEL ?? "info",
          transport: {
            target: "pino-pretty",
            options: { translateTime: "HH:MM:ss" },
          },
        },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET ?? "dev-cookie-secret-change-me",
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Kanban Auth Service",
        description: "Authentication & user management API",
        version: "0.1.0",
      },
      servers: [{ url: "/" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      persistAuthorization: true,
    },
  });

  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Health check",
        response: {
          200: z.object({
            status: z.literal("ok"),
            service: z.literal("auth"),
            database: z.enum(["connected", "disconnected"]),
            redis: z.enum(["connected", "disconnected"]),
          }),
        },
      },
    },
    async () => {
      let redisStatus: "connected" | "disconnected" = "disconnected";
      try {
        const pong = await redis.ping();
        if (pong === "PONG") redisStatus = "connected";
      } catch {
        // disconnected
      }

      try {
        await prisma.$queryRaw`SELECT 1`;
        return {
          status: "ok" as const,
          service: "auth" as const,
          database: "connected" as const,
          redis: redisStatus,
        };
      } catch {
        return {
          status: "ok" as const,
          service: "auth" as const,
          database: "disconnected" as const,
          redis: redisStatus,
        };
      }
    },
  );

  await app.register(authRoutes, { prefix: "/auth" });

  return app;
}
