export class AppError extends Error {
  constructor(message: string, public code = 'APP_ERROR') {
    super(message);
  }
}
