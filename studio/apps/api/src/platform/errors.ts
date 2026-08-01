export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "AppError"
  }
}

export const notFound = (entity: string) => new AppError("not_found", `${entity} not found`, 404)
export const conflict = (message: string) => new AppError("conflict", message, 409)
export const unavailable = (message: string) => new AppError("service_unavailable", message, 503)
