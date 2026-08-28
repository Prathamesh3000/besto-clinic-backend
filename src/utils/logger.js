'use strict';

/**
 * Winston logger — structured JSON in production, colorized console in dev.
 * Optional daily-rotate file transport when LOG_TO_FILE=true.
 */

const { createLogger, format, transports } = require('winston');
const path = require('path');

// Read raw env (env.js may not be loaded yet when logger is first required)
const NODE_ENV  = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'http' : 'debug');
const LOG_TO_FILE = process.env.LOG_TO_FILE === 'true';

const { combine, timestamp, printf, colorize, errors, json, splat } = format;

// Human-readable format for dev
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  splat(),
  printf(({ timestamp: ts, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}: ${stack || message}${metaStr}`;
  }),
);

// Structured JSON for production
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json(),
);

const logger = createLogger({
  level: LOG_LEVEL,
  format: NODE_ENV === 'production' ? prodFormat : devFormat,
  defaultMeta: { service: 'bestoclinic-api' },
  transports: [new transports.Console()],
  exitOnError: false,
});

// Optional file transports
if (LOG_TO_FILE) {
  const DailyRotateFile = require('winston-daily-rotate-file');
  const logsDir = path.resolve(__dirname, '../../logs');

  logger.add(new DailyRotateFile({
    dirname: logsDir,
    filename: 'app-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: prodFormat,
  }));

  logger.add(new DailyRotateFile({
    dirname: logsDir,
    filename: 'error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize: '20m',
    maxFiles: '30d',
    format: prodFormat,
  }));
}

// Morgan stream adapter
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
