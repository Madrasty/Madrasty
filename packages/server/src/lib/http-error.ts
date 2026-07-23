// A typed error carrying an HTTP status + a stable machine code, so the central
// error handler can turn any thrown failure into a consistent JSON response.
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(code: string, message: string) {
    return new HttpError(400, code, message);
  }

  static unauthorized(code: string, message: string) {
    return new HttpError(401, code, message);
  }

  static forbidden(code: string, message: string) {
    return new HttpError(403, code, message);
  }

  static notFound(code: string, message: string) {
    return new HttpError(404, code, message);
  }

  static conflict(code: string, message: string) {
    return new HttpError(409, code, message);
  }

  static tooManyRequests(code: string, message: string) {
    return new HttpError(429, code, message);
  }
}
