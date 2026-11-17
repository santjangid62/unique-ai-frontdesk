export class ApiError extends Error {
  constructor(status, message, details = null, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }

  static badRequest(message = 'Invalid request', details = null) {
    return new ApiError(400, message, details, 'BAD_REQUEST');
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, null, 'UNAUTHORIZED');
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message, null, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message, null, 'NOT_FOUND');
  }

  static conflict(message = 'Resource already exists', details = null) {
    return new ApiError(409, message, details, 'CONFLICT');
  }

  static tooMany(message = 'Too many requests, please try again later') {
    return new ApiError(429, message, null, 'RATE_LIMITED');
  }

  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new ApiError(503, message, null, 'UNAVAILABLE');
  }
}
