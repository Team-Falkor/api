export interface ResponseOptions<T> {
  success: boolean;
  error?: boolean;
  message?: string;
  data?: T | null | undefined;
}
