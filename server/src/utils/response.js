/** Consistent JSON envelope for every API response. */
export function ok(res, data = null, meta = undefined, status = 200) {
  const payload = { success: true, data };
  if (meta !== undefined) payload.meta = meta;
  return res.status(status).json(payload);
}

export function created(res, data) {
  return ok(res, data, undefined, 201);
}

export function paginated(res, items, { page, limit, total }) {
  return ok(res, items, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNext: page * limit < total,
  });
}

export function parsePaging(query, defaults = { page: 1, limit: 20, maxLimit: 100 }) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || defaults.page);
  const limit = Math.min(defaults.maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaults.limit));
  return { page, limit, skip: (page - 1) * limit };
}
