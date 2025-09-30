class AppError extends Error {
  constructor(message, statusCode = 500, details) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class AuthError extends AppError {
  constructor(message = 'Unauthorized', statusCode = 401, details) {
    super(message, statusCode, details);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super(message, 400, details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found', details) {
    super(message, 404, details);
  }
}

module.exports = { AppError, AuthError, ValidationError, NotFoundError };


