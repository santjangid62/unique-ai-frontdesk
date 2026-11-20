import mongoose from 'mongoose';

/**
 * Removes the throwaway business that smoke.js creates for the signup and
 * email-verification checks.
 *
 * Safety rules, all enforced before anything is deleted:
 *  - an explicit tenant id and the exact signup email are required;
 *  - the tenant must still be named "Smoke Verify Institute";
 *  - its contact email must be the smoke run's own random address;
 *  - it must have been created within the last hour.
 * Only that tenant id and users carrying that email/tenant are touched.
 */
export const SMOKE_TENANT_NAME = 'Smoke Verify Institute';

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

const MAX_AGE_MS = 60 * 60 * 1000;

export async function cleanupSmokeBusiness({ tenantId, email }) {
  if (!tenantId || !email) return { removed: false, reason: 'tenantId and email are required' };
  if (!mongoose.Types.ObjectId.isValid(String(tenantId))) {
    return { removed: false, reason: 'tenantId is not a valid ObjectId' };
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) return { removed: false, reason: 'MONGODB_URI is not set, skipping database cleanup' };

  const ownsConnection = mongoose.connection.readyState !== 1;
  if (ownsConnection) await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  try {
    const db = mongoose.connection.db;
    const tenantObjectId = new mongoose.Types.ObjectId(String(tenantId));
    const tenant = await db.collection('tenants').findOne({ _id: tenantObjectId });

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

    const userIds = (
      await db
        .collection('users')
        .find({ $or: [{ email: String(email).toLowerCase() }, { tenantId: tenantObjectId }] })
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
  } finally {
    if (ownsConnection) await mongoose.disconnect();
  }
}

export default cleanupSmokeBusiness;
