import { ApiResponse } from "@team-falkor/shared-types";

export const createApiResponse = <T>(input: ApiResponse<T>): ApiResponse<T> => {
  const { success, message, data, error, meta } = input;

  let finalError: ApiResponse<T>["error"] | undefined = error;

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
    ...(meta && { meta }),
  };
};
