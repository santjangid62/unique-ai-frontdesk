import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated, parsePaging } from '../utils/response.js';
import { authenticate } from '../middleware/auth.js';
import Notification from '../models/Notification.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePaging(req.query);
    const filter = { userId: req.user.id };
    if (req.query.unread === 'true') filter.readAt = null;
    if (req.query.type) filter.type = req.query.type;

    const [items, total, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.user.id, readAt: null }),
    ]);

    return ok(
      res,
      items.map((item) => ({ ...item, id: String(item._id) })),
      { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), unread },
    );
  }),
);

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const unread = await Notification.countDocuments({ userId: req.user.id, readAt: null });
    return ok(res, { unread });
  }),
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await Notification.updateOne(
      { _id: req.params.id, userId: req.user.id },
      { $set: { readAt: new Date() } },
    );
    return ok(res, { message: 'Marked as read' });
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await Notification.updateMany(
      { userId: req.user.id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return ok(res, { updated: result.modifiedCount });
  }),
);

export default router;
