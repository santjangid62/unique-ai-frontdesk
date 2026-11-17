import { Router } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import { requireBusinessAdmin, requireSuperAdmin, resolveTenantId } from '../middleware/rbac.js';
import { addDays, endOfDay, startOfDay } from '../utils/date.js';
import Lead from '../models/Lead.js';
import Conversation from '../models/Conversation.js';
import Appointment from '../models/Appointment.js';
import Call from '../models/Call.js';
import UsageLog from '../models/UsageLog.js';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import Subscription from '../models/Subscription.js';
import Plan from '../models/Plan.js';
import KnowledgeEntry from '../models/KnowledgeEntry.js';

const router = Router();
router.use(authenticate);

const dayKey = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };

/** Business dashboard metrics, always scoped to the authenticated tenant. */
router.get(
  '/business/overview',
  requireBusinessAdmin,
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const oid = new mongoose.Types.ObjectId(tenantId);
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 14));
    const since = startOfDay(addDays(new Date(), -(days - 1)));
    const today = startOfDay();

    const [
      leadTotal,
      newLeads,
      conversationTotal,
      openConversations,
      handoffTotal,
      appointmentTotal,
      upcoming,
      todayAppointments,
      callTotal,
      missedCalls,
      aiMessages,
      knowledgeCount,
      leadTrend,
      conversationTrend,
      appointmentTrend,
      channelSplit,
      statusSplit,
      recentLeads,
      upcomingList,
    ] = await Promise.all([
      Lead.countDocuments({ tenantId, isDeleted: false }),
      Lead.countDocuments({ tenantId, isDeleted: false, status: 'new' }),
      Conversation.countDocuments({ tenantId }),
      Conversation.countDocuments({ tenantId, status: { $in: ['open', 'pending', 'handoff'] } }),
      Conversation.countDocuments({ tenantId, status: 'handoff' }),
      Appointment.countDocuments({ tenantId }),
      Appointment.countDocuments({ tenantId, status: { $in: ['scheduled', 'confirmed'] }, startAt: { $gte: today } }),
      Appointment.countDocuments({ tenantId, startAt: { $gte: today, $lte: endOfDay() } }),
      Call.countDocuments({ tenantId }),
      Call.countDocuments({ tenantId, status: { $in: ['missed', 'failed'] } }),
      UsageLog.countDocuments({ tenantId, kind: 'ai', createdAt: { $gte: since } }),
      KnowledgeEntry.countDocuments({ tenantId, isEnabled: true }),
      Lead.aggregate([{ $match: { tenantId: oid, isDeleted: false, createdAt: { $gte: since } } }, { $group: { _id: dayKey, count: { $sum: 1 } } }]),
      Conversation.aggregate([{ $match: { tenantId: oid, createdAt: { $gte: since } } }, { $group: { _id: dayKey, count: { $sum: 1 } } }]),
      Appointment.aggregate([{ $match: { tenantId: oid, createdAt: { $gte: since } } }, { $group: { _id: dayKey, count: { $sum: 1 } } }]),
      Conversation.aggregate([{ $match: { tenantId: oid } }, { $group: { _id: '$channel', count: { $sum: 1 } } }]),
      Lead.aggregate([{ $match: { tenantId: oid, isDeleted: false } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Lead.find({ tenantId, isDeleted: false }).sort({ createdAt: -1 }).limit(5).lean(),
      Appointment.find({ tenantId, startAt: { $gte: today }, status: { $in: ['scheduled', 'confirmed'] } })
        .sort({ startAt: 1 })
        .limit(5)
        .lean(),
    ]);

    const byDay = (list) => new Map(list.map((row) => [row._id, row.count]));
    const leadsByDay = byDay(leadTrend);
    const convosByDay = byDay(conversationTrend);
    const appointmentsByDay = byDay(appointmentTrend);

    const trends = [];
    for (let i = 0; i < days; i += 1) {
      const date = new Date(since);
      date.setDate(date.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      trends.push({
        date: key,
        leads: leadsByDay.get(key) || 0,
        conversations: convosByDay.get(key) || 0,
        appointments: appointmentsByDay.get(key) || 0,
      });
    }

    const aiResolutionRate = conversationTotal ? Math.round(((conversationTotal - handoffTotal) / conversationTotal) * 100) : 0;

    return ok(res, {
      kpis: {
        leadTotal,
        newLeads,
        conversationTotal,
        openConversations,
        handoffTotal,
        aiResolutionRate,
        appointmentTotal,
        upcomingAppointments: upcoming,
        todayAppointments,
        callTotal,
        missedCalls,
        aiMessages,
        knowledgeCount,
      },
      trends,
      channels: channelSplit.map((row) => ({ channel: row._id, count: row.count })),
      leadStatus: statusSplit.map((row) => ({ status: row._id, count: row.count })),
      recentLeads: recentLeads.map((lead) => ({ ...lead, id: String(lead._id) })),
      upcomingAppointments: upcomingList.map((item) => ({ ...item, id: String(item._id) })),
    });
  }),
);

/** Platform-wide metrics restricted to Super Admin accounts. */
router.get(
  '/platform/overview',
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [tenantTotal, tenantStatus, newTenants, userTotal, roleSplit, planSplit, subscriptions, usageSplit, recentTenants, aiUsage] =
      await Promise.all([
        Tenant.countDocuments(),
        Tenant.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Tenant.countDocuments({ createdAt: { $gte: monthStart } }),
        User.countDocuments({ isActive: true }),
        User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
        Tenant.aggregate([{ $group: { _id: '$planCode', count: { $sum: 1 } } }]),
        Subscription.find().lean(),
        UsageLog.aggregate([{ $group: { _id: '$kind', quantity: { $sum: '$quantity' } } }]),
        Tenant.find().sort({ createdAt: -1 }).limit(6).lean(),
        UsageLog.countDocuments({ kind: 'ai', createdAt: { $gte: monthStart } }),
      ]);

    const plans = await Plan.find().lean();
    const priceByCode = new Map(plans.map((plan) => [plan.code, plan.priceMonthly || 0]));
    const mrr = subscriptions
      .filter((sub) => sub.status === 'active')
      .reduce((sum, sub) => sum + (priceByCode.get(sub.planCode) || 0), 0);

    const paidInvoices = subscriptions.flatMap((sub) => sub.invoices || []).filter((invoice) => invoice.status === 'paid');
    const revenueTotal = paidInvoices.reduce((sum, invoice) => sum + (invoice.amount || 0), 0);

    return ok(res, {
      tenants: {
        total: tenantTotal,
        newThisMonth: newTenants,
        byStatus: Object.fromEntries(tenantStatus.map((row) => [row._id, row.count])),
      },
      users: {
        total: userTotal,
        byRole: Object.fromEntries(roleSplit.map((row) => [row._id, row.count])),
      },
      revenue: { mrr, revenueTotal, invoiceCount: paidInvoices.length, currency: 'INR' },
      usage: {
        byKind: Object.fromEntries(usageSplit.map((row) => [row._id, Math.round(row.quantity * 100) / 100])),
        aiMessagesThisMonth: aiUsage,
      },
      planDistribution: planSplit.map((row) => ({
        planCode: row._id,
        count: row.count,
        priceMonthly: priceByCode.get(row._id) || 0,
      })),
      recentTenants: recentTenants.map((tenant) => ({ ...tenant, id: String(tenant._id) })),
    });
  }),
);

export default router;
