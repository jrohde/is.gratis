export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Log in first');
export const forbidden = () => new HttpError(403, 'forbidden', 'Not allowed');
export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
export const tooManyRequests = (message: string) => new HttpError(429, 'rate_limited', message);
