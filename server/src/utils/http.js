export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
export const forbidden = (message = 'You do not have access to this resource') => new HttpError(403, message);
export const notFound = (message = 'Resource not found') => new HttpError(404, message);
export const conflict = (message, details) => new HttpError(409, message, details);
export const unprocessable = (message, details) => new HttpError(422, message, details);
export const tooMany = (message = 'Too many requests') => new HttpError(429, message);

/** Wraps an async route handler so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Single response envelope used by the whole API. */
export const ok = (res, data, meta) => res.json(meta ? { data, meta } : { data });
export const created = (res, data) => res.status(201).json({ data });
export const noContent = (res) => res.status(204).end();

/** Throws a 422 with field errors when a Zod schema fails. */
export function assertSchema(schema, payload) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const fieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    throw unprocessable('Please fix the highlighted fields.', fieldErrors);
  }
  return parsed.data;
}
