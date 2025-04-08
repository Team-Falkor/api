import { ResponseOptions } from "../@types/types";

export const createResponse = <T>({
  success,
  error = false,
  message,
  data = undefined,
}: ResponseOptions<T>) => ({
  success,
  error,
  message,
  data,
});
