import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';

/**
 * Cleanup helpers for the throwaway business that smoke.js creates for the
 * signup and email-verification checks.
 *
 * Two entry points:
 *  - cleanupSmokeBusiness(): removes the tenant from the current run.
 *  - sweepStaleSmokeBusinesses(): removes leftovers from earlier runs that
 *    crashed before they could clean up after themselves.
 *
 * Both only ever touch a tenant named "Smoke Verify Institute" whose contact
 * email matches the random smoke pattern, and they refuse recent records so a
 * concurrent run cannot delete another run's tenant.
 */
export const SMOKE_TENANT_NAME = 'Smoke Verify Institute';
export const SMOKE_EMAIL_PATTERN = /^smoke\.verify\.\d+@example\.com$/;

/** Leftovers must be older than this before the sweep will delete them. */
const STALE_AGE_MS = 30 * 60 * 1000;
/** A single run removes at most this many leftovers, so a bad filter cannot wipe data. */
const SWEEP_LIMIT = 25;
/** The current run's own tenant must still be fresh when it is cleaned up. */
const MAX_AGE_MS = 60 * 60 * 1000;

const TENANT_COLLECTIONS = [
  'aiagents',
  'appointments',
  'auditlogs',
  'automationrules',
  'businessprofiles',
  'calls',
  'conversations',
  'customers',
  'integrations',
  'knowledgeentries',
  'leads',
  'messages',
  'notifications',
  'subscriptions',
  'usagelogs',
];

async function withDatabase(callback) {
  const uri = process.env.MONGODB_URI;
  if (!uri) return { skipped: true, reason: 'MONGODB_URI is not set, skipping database cleanup' };

  const ownsConnection = mongoose.connection.readyState !== 1;
  // Through connectDB() so the preview guard applies to cleanup runs as well.
  if (ownsConnection) await connectDB(uri);
  try {
    return await callback(mongoose.connection.db);
  } finally {
    if (ownsConnection) await disconnectDB();
  }
}

/** Deletes one verified smoke tenant and every record scoped to it. */
async function removeSmokeTenant(db, tenant) {
  const tenantObjectId = tenant._id;
  const userIds = (
    await db
      .collection('users')
      .find({ $or: [{ email: tenant.contactEmail }, { tenantId: tenantObjectId }] })
      .project({ _id: 1 })
      .toArray()
  ).map((user) => user._id);

  await db.collection('refreshtokens').deleteMany({ userId: { $in: userIds } });
  await db.collection('passwordresets').deleteMany({ userId: { $in: userIds } });
  const removedUsers = (await db.collection('users').deleteMany({ _id: { $in: userIds } })).deletedCount;

  let removedDocuments = 0;
  for (const name of TENANT_COLLECTIONS) {
    const result = await db.collection(name).deleteMany({ tenantId: tenantObjectId });
    removedDocuments += result.deletedCount;
  }

  const removedTenant = (await db.collection('tenants').deleteOne({ _id: tenantObjectId })).deletedCount;
  return { removed: removedTenant === 1, removedTenant, removedUsers, removedDocuments };
}

/** Removes exactly the business created by this smoke run. */
export async function cleanupSmokeBusiness({ tenantId, email }) {
  if (!tenantId || !email) return { removed: false, reason: 'tenantId and email are required' };
  if (!mongoose.Types.ObjectId.isValid(String(tenantId))) {
    return { removed: false, reason: 'tenantId is not a valid ObjectId' };
  }

  return withDatabase(async (db) => {
    const tenant = await db.collection('tenants').findOne({ _id: new mongoose.Types.ObjectId(String(tenantId)) });

    if (!tenant) return { removed: false, reason: 'tenant not found' };
    if (tenant.name !== SMOKE_TENANT_NAME) {
      return { removed: false, reason: 'refusing to delete a tenant that is not a smoke test business' };
    }
    if (String(tenant.contactEmail || '').toLowerCase() !== String(email).toLowerCase()) {
      return { removed: false, reason: 'refusing to delete a tenant with a different contact email' };
    }
    if (!tenant.createdAt || Date.now() - new Date(tenant.createdAt).getTime() > MAX_AGE_MS) {
      return { removed: false, reason: 'refusing to delete a tenant older than one hour' };
    }

    return removeSmokeTenant(db, tenant);
  });
}

/**
 * Removes leftovers from earlier runs that crashed before cleanup ran. Guarded by
 * the exact tenant name, the smoke email pattern and a minimum age, and capped per run.
 */
export async function sweepStaleSmokeBusinesses({ olderThanMs = STALE_AGE_MS, limit = SWEEP_LIMIT } = {}) {
  return withDatabase(async (db) => {
    const cutoff = new Date(Date.now() - olderThanMs);
    const stale = await db
      .collection('tenants')
      .find({ name: SMOKE_TENANT_NAME, contactEmail: SMOKE_EMAIL_PATTERN, createdAt: { $lt: cutoff } })
      .project({ _id: 1, slug: 1, contactEmail: 1, createdAt: 1 })
      .limit(limit)
      .toArray();

    const removed = [];
    for (const tenant of stale) {
      // Re-check the pattern in code as well as in the query.
      if (!SMOKE_EMAIL_PATTERN.test(String(tenant.contactEmail || ''))) continue;
      if (Date.now() - new Date(tenant.createdAt).getTime() < olderThanMs) continue;
      const result = await removeSmokeTenant(db, tenant);
      if (result.removed) removed.push(tenant.slug);
    }

    return { removed: removed.length, slugs: removed, skipped: false };
  });
}

export default cleanupSmokeBusiness;
