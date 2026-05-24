/**
 * Parses an axios error from the SIS API into a usable shape.
 * The backend Zod handler returns: { error: 'Validation error', details: { fieldErrors, formErrors } }
 * Other endpoints return: { error: '<message>' }
 */

export interface ApiError {
  message: string;
  fields: Record<string, string>;
}

export const EMPTY_API_ERROR: ApiError = { message: '', fields: {} };

interface ApiResponseShape {
  error?: string;
  details?: {
    fieldErrors?: Record<string, string[]>;
    formErrors?: string[];
  };
}

export function parseApiError(e: unknown, fallback = 'Something went wrong'): ApiError {
  const data = (e as { response?: { data?: ApiResponseShape } })?.response?.data;
  const fields: Record<string, string> = {};
  const fe = data?.details?.fieldErrors;
  if (fe && typeof fe === 'object') {
    for (const [k, v] of Object.entries(fe)) {
      if (Array.isArray(v) && v.length > 0) fields[k] = String(v[0]);
    }
  }
  const formErrors = data?.details?.formErrors;
  let message = data?.error ?? fallback;
  if (Array.isArray(formErrors) && formErrors.length > 0 && Object.keys(fields).length === 0) {
    message = formErrors[0];
  }
  // If we have field errors, the top-level "Validation error" message is redundant — suppress it
  if (Object.keys(fields).length > 0 && message === 'Validation error') message = '';
  return { message, fields };
}
