import { existsSync } from "node:fs"

import helmet from "@fastify/helmet"
import multipart from "@fastify/multipart"
import staticPlugin from "@fastify/static"
import Fastify, { type FastifyInstance } from "fastify"

import { AppError } from "./platform/errors.js"
import { registerApiRoutes } from "./routes.js"
import type { CenterServices } from "./services.js"

export async function buildApp(services: CenterServices): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: services.config.logLevel },
    trustProxy: true,
    bodyLimit: 8 * 1024 * 1024,
    requestTimeout: 0,
  })
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  })
  await app.register(multipart, {
    limits: { files: 1, fileSize: 32 * 1024 * 1024, fields: 4, parts: 5 },
  })
  await app.register(async (api) => registerApiRoutes(api, services), { prefix: "/api/v1" })

  if (existsSync(services.config.webRoot)) {
    await app.register(staticPlugin, {
      root: services.config.webRoot,
      prefix: "/",
      wildcard: false,
    })
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: { code: "not_found", message: "Route not found", requestId: request.id } })
      }
      return reply.type("text/html; charset=utf-8").sendFile("index.html", services.config.webRoot)
    })
  }

  app.setErrorHandler((error, request, reply) => {
    const validationError = typeof error === "object" && error !== null && "validation" in error
    const appError = error instanceof AppError
      ? error
      : validationError
        ? new AppError("validation_error", error instanceof Error ? error.message : "Request validation failed", 400)
        : new AppError("internal_error", "Internal server error", 500)
    if (appError.statusCode >= 500) request.log.error({ err: error }, appError.message)
    return reply.code(appError.statusCode).send({
      error: { code: appError.code, message: appError.message, requestId: request.id },
    })
  })
  app.addHook("onClose", async () => {
    await services.pool.end()
  })
  return app
}
