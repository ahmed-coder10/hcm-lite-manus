import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `No route for ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = err instanceof HttpError ? err.status : err.status || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details || null;

  if (err.name === 'ValidationError') {
    status = 422;
    message = 'Please fix the highlighted fields.';
    details = {};
    for (const [field, e] of Object.entries(err.errors || {})) details[field] = e.message;
  }
  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${err.path}.`;
  }
  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `That ${field} is already in use.`;
    details = { [field]: 'Already exists' };
  }

  if (status >= 500) {
    console.error('[error]', err);
    if (env.isProd) message = 'Something went wrong on our side. Please try again.';
  }

  res.status(status).json({ error: { message, details } });
}
