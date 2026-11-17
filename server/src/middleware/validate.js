import { ApiError } from '../utils/ApiError.js';

/**
 * Validates request data with a Zod schema. Parsed (and coerced) data replaces
 * the raw input so handlers never see unvalidated fields.
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return next(ApiError.badRequest('Validation failed', details));
  }
  if (source === 'query') req.query = result.data;
  else if (source === 'params') req.params = { ...req.params, ...result.data };
  else req.body = result.data;
  return next();
};

/** ObjectId path parameter schema helper. */
export const objectIdSchema = (field = 'id') => ({
  [field]: { type: 'string', pattern: /^[0-9a-fA-F]{24}$/ },
});

export default validate;
