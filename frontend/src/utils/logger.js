// Thin logger wrapper so we can silence FE diagnostics in production builds.
//
// Usage: `import { logger } from '../utils/logger'` then `logger.info(...)`.
// `logger.error` always runs (we want errors reported even in prod).

const isDev =
  typeof import.meta !== 'undefined' && import.meta.env
    ? Boolean(import.meta.env.DEV)
    : true

function noop() {}

export const logger = {
  info: isDev ? console.log.bind(console) : noop,
  warn: isDev ? console.warn.bind(console) : noop,
  debug: isDev ? console.debug.bind(console) : noop,
  error: console.error.bind(console),
}
