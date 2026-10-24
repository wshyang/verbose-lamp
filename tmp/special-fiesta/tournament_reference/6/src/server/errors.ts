export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function badRequest(message: string, code = 'INVALID_INPUT'): AppError {
  return new AppError(400, code, message);
}

export function notFound(message: string): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}

export function conflict(message: string, code = 'CONFLICT'): AppError {
  return new AppError(409, code, message);
}

export function unprocessable(message: string, code = 'INVALID_INPUT'): AppError {
  return new AppError(422, code, message);
}
