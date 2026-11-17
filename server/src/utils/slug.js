export function slugify(value, fallback = 'business') {
  const slug = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

export async function uniqueSlug(Model, base, existingId = null) {
  const root = slugify(base);
  let candidate = root;
  for (let i = 2; i < 200; i += 1) {
    const found = await Model.findOne({ slug: candidate }).select('_id').lean();
    if (!found || String(found._id) === String(existingId)) return candidate;
    candidate = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}
