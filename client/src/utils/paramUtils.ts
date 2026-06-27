import type { JsonSchemaType } from "./jsonUtils";

type JsonFormRef = {
  validateJson: () => {
    isValid: boolean;
    error: string | null;
    value?: unknown;
  };
};

export interface FlushedFormParamsResult {
  isValid: boolean;
  params: Record<string, unknown>;
}

/**
 * Flushes pending JSON editor state from DynamicJsonForm refs and returns
 * the parameters to use for tool execution. validateJson() updates parent
 * state asynchronously, so callers must use the returned params instead of
 * React state when invoking tools immediately after validation.
 */
export function flushFormParams(
  params: Record<string, unknown>,
  formRefs: Record<string, JsonFormRef | null>,
): FlushedFormParamsResult {
  const flushedParams = { ...params };

  for (const [key, ref] of Object.entries(formRefs)) {
    if (!ref) {
      continue;
    }

    const result = ref.validateJson();
    if (!result.isValid) {
      return { isValid: false, params: flushedParams };
    }

    if (result.value !== undefined) {
      flushedParams[key] = result.value;
    }
  }

  return { isValid: true, params: flushedParams };
}

/**
 * Cleans parameters by removing undefined, null, and empty string values for optional fields
 * while preserving all values for required fields and fields with explicit default values.
 *
 * @param params - The parameters object to clean
 * @param schema - The JSON schema defining which fields are required
 * @returns Cleaned parameters object with optional empty fields omitted
 */
export function cleanParams(
  params: Record<string, unknown>,
  schema: JsonSchemaType,
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  const required = schema.required || [];
  const properties = schema.properties || {};

  for (const [key, value] of Object.entries(params)) {
    const isFieldRequired = required.includes(key);
    const fieldSchema = properties[key] as JsonSchemaType | undefined;

    // Check if the field has an explicit default value
    const hasDefault = fieldSchema && "default" in fieldSchema;
    const defaultValue = hasDefault ? fieldSchema.default : undefined;

    if (isFieldRequired) {
      // Required fields: always include, even if empty string or falsy
      cleaned[key] = value;
    } else if (hasDefault && value === defaultValue) {
      // Field has a default value and current value matches it - preserve it
      // This is important for cases like default: null
      cleaned[key] = value;
    } else {
      // Optional fields: only include if they have meaningful values
      if (value !== undefined && value !== "" && value !== null) {
        cleaned[key] = value;
      }
      // Empty strings, undefined, null for optional fields → omit completely
    }
  }

  return cleaned;
}
