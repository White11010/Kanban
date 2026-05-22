import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../db.js";

const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

const userPublicSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.coerce.date(),
});

const errorSchema = z.object({
  message: z.string(),
});

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/register",
    {
      schema: {
        tags: ["auth"],
        summary: "Register a new user",
        body: registerBodySchema,
        response: {
          201: userPublicSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { email, password, name } = request.body;

      const existing = await prisma.user.findUnique({
        where: { email },
      });

      if (existing) {
        return reply.status(409).send({
          message: "Email already registered",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
        },
      });

      return reply.status(201).send({
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      });
    },
  );
};
