'use strict';

const { createLogger, format, transports } = require('winston');
const config = require('../config');

const logger = createLogger({
  level: config.isDev ? 'debug' : 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    config.isDev
      ? format.combine(format.colorize(), format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}] ${message}${metaStr}`;
        }))
      : format.json()
  ),
  transports: [new transports.Console()],
});

module.exports = logger;
