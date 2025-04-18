type ApiError =
  | {
      message: string;
      code?: string;
    }
  | boolean;

interface ApiResponseInput<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: ApiError;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: ApiError;
}

export const createApiResponse = <T>(
  input: ApiResponseInput<T>
): ApiResponse<T> => {
  const { success, message, data, error } = input;

  let finalError: ApiError | undefined = error;

  if (!success && !finalError) {
    console.warn(
      "createApiResponse called with success: false but no 'error' object. Using message as fallback."
    );
    finalError = {
      message: message || "An unknown error occurred.",
    };
  }

  if (success && finalError) {
    console.warn(
      "createApiResponse called with success: true but an 'error' object was provided. Ignoring error."
    );
    finalError = undefined;
  }

  return {
    success,
    ...(message && { message }),
    ...(success && data !== undefined && { data }),
    ...(!success && finalError && { error: finalError }),
  };
};
