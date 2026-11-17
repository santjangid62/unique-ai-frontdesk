import Notification from '../models/Notification.js';
import User from '../models/User.js';

export async function notifyUser({ userId, tenantId = null, type = 'system', title, body = '', link = '' }) {
  try {
    await Notification.create({ userId, tenantId, type, title, body, link });
  } catch (error) {
    console.error('[notify] failed', error.message);
  }
}

/** Notifies every active business admin of a tenant. */
export async function notifyTenantAdmins(tenantId, payload) {
  try {
    const admins = await User.find({ tenantId, role: 'business_admin', isActive: true }).select('_id').lean();
    if (!admins.length) return;
    await Notification.insertMany(
      admins.map((admin) => ({
        userId: admin._id,
        tenantId,
        type: payload.type || 'system',
        title: payload.title,
        body: payload.body || '',
        link: payload.link || '',
      })),
    );
  } catch (error) {
    console.error('[notify] admin notify failed', error.message);
  }
}

/** Notifies the business admins together with every active staff member. */
export async function notifyTenantTeam(tenantId, payload) {
  try {
    const users = await User.find({
      tenantId,
      isActive: true,
      role: { $in: ['business_admin', 'staff'] },
    })
      .select('_id')
      .lean();
    if (!users.length) return;
    await Notification.insertMany(
      users.map((user) => ({
        userId: user._id,
        tenantId,
        type: payload.type || 'system',
        title: payload.title,
        body: payload.body || '',
        link: payload.link || '',
      })),
    );
  } catch (error) {
    console.error('[notify] team notify failed', error.message);
  }
}
