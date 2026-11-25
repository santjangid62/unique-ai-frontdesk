import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok, paginated, parsePaging } from '../utils/response.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { requireTenantUser, resolveTenantId, tenantScopeGuard } from '../middleware/rbac.js';
import { audit } from '../utils/audit.js';
import KnowledgeEntry, { KNOWLEDGE_CATEGORIES } from '../models/KnowledgeEntry.js';
import KnowledgeDocument from '../models/KnowledgeDocument.js';
import Subscription from '../models/Subscription.js';
import { recordUsage } from '../services/usage.js';

const router = Router();
router.use(authenticate, tenantScopeGuard, requireTenantUser);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/octet-stream'];
    const extension = String(file.originalname).toLowerCase().split('.').pop();
    if (allowed.includes(file.mimetype) || ['txt', 'md', 'csv'].includes(extension)) return cb(null, true);
    return cb(new ApiError(400, 'Only PDF, TXT, MD or CSV files are supported'));
  },
});

const entrySchema = z.object({
  category: z.enum(KNOWLEDGE_CATEGORIES).default('faq'),
  title: z.string().min(2).max(200),
  content: z.string().min(2).max(20000),
  tags: z.array(z.string().max(40)).optional().default([]),
  isEnabled: z.boolean().optional().default(true),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const { page, limit, skip } = parsePaging(req.query, { page: 1, limit: 25, maxLimit: 200 });
    const filter = { tenantId };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.enabled === 'true') filter.isEnabled = true;
    if (req.query.enabled === 'false') filter.isEnabled = false;
    if (req.query.search) {
      const term = String(req.query.search).trim();
      filter.$or = [
        { title: { $regex: term, $options: 'i' } },
        { content: { $regex: term, $options: 'i' } },
        { tags: { $regex: term, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      KnowledgeEntry.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      KnowledgeEntry.countDocuments(filter),
    ]);
    return paginated(res, items.map((item) => ({ ...item, id: String(item._id) })), { page, limit, total });
  }),
);

async function enforceKnowledgeLimit(tenantId) {
  const subscription = await Subscription.findOne({ tenantId }).lean();
  const { default: Plan } = await import('../models/Plan.js');
  const plan = await Plan.findOne({ code: subscription?.planCode || 'starter' }).lean();
  const limit = plan?.limits?.knowledgeEntries ?? 100;
  const count = await KnowledgeEntry.countDocuments({ tenantId });
  if (count >= limit) {
    throw ApiError.forbidden(`Your plan allows ${limit} knowledge entries. Upgrade or remove older entries.`);
  }
}

router.post(
  '/',
  validate(entrySchema),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    await enforceKnowledgeLimit(tenantId);
    const entry = await KnowledgeEntry.create({ ...req.body, tenantId, updatedBy: req.user.id });
    await Subscription.updateOne({ tenantId }, { $inc: { 'usage.knowledgeEntries': 1 } });
    await audit(req, { action: 'knowledge.created', entity: 'KnowledgeEntry', entityId: entry._id, meta: { title: entry.title } });
    return created(res, entry.toJSON());
  }),
);

router.put(
  '/:id',
  validate(entrySchema.partial()),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const entry = await KnowledgeEntry.findOne({ _id: req.params.id, tenantId });
    if (!entry) throw ApiError.notFound('Knowledge entry not found');
    const contentChanged = req.body.content !== undefined && req.body.content !== entry.content;
    Object.assign(entry, req.body);
    // A cached Hindi translation must not outlive the English text it came from.
    if (contentChanged && req.body.contentHi === undefined) entry.contentHi = '';
    entry.version += 1;
    entry.updatedBy = req.user.id;
    await entry.save();
    await audit(req, { action: 'knowledge.updated', entity: 'KnowledgeEntry', entityId: entry._id });
    return ok(res, entry.toJSON());
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const entry = await KnowledgeEntry.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!entry) throw ApiError.notFound('Knowledge entry not found');
    await recordUsage(tenantId, 'storage', -1);
    await audit(req, { action: 'knowledge.deleted', entity: 'KnowledgeEntry', entityId: entry._id, severity: 'warning' });
    return ok(res, { message: 'Knowledge entry deleted' });
  }),
);

async function extractText(file) {
  const name = String(file.originalname).toLowerCase();
  if (file.mimetype === 'application/pdf' || name.endsWith('.pdf')) {
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const parsed = await pdfParse(file.buffer);
    return String(parsed.text || '');
  }
  return file.buffer.toString('utf8');
}

function chunkText(text, size = 1200) {
  const clean = String(text).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n\n+/);
  const chunks = [];
  let buffer = '';
  for (const paragraph of paragraphs) {
    if ((buffer + paragraph).length > size && buffer) {
      chunks.push(buffer.trim());
      buffer = '';
    }
    buffer += `${paragraph}\n\n`;
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks.slice(0, 200);
}

router.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    if (!req.file) throw ApiError.badRequest('No file uploaded');
    await enforceKnowledgeLimit(tenantId);

    const document = await KnowledgeDocument.create({
      tenantId,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      status: 'processing',
      uploadedBy: req.user.id,
    });

    try {
      const text = await extractText(req.file);
      if (!text.trim()) throw new Error('No readable text found in the document');
      const chunks = chunkText(text);
      const entries = await KnowledgeEntry.insertMany(
        chunks.map((chunk, index) => ({
          tenantId,
          category: 'other',
          title: `${req.file.originalname} - part ${index + 1}`,
          content: chunk.slice(0, 20000),
          tags: ['document'],
          source: 'document',
          documentId: document._id,
          updatedBy: req.user.id,
        })),
      );

      document.status = 'ready';
      document.extractedText = text.slice(0, 200000);
      document.entriesCreated = entries.length;
      await document.save();
      await Subscription.updateOne({ tenantId }, { $inc: { 'usage.knowledgeEntries': entries.length } });

      await audit(req, {
        action: 'knowledge.document_uploaded',
        entity: 'KnowledgeDocument',
        entityId: document._id,
        meta: { filename: document.filename, entries: entries.length },
      });

      return created(res, { document: document.toJSON(), entries: entries.map((entry) => entry.toJSON()) });
    } catch (error) {
      document.status = 'failed';
      document.error = error.message;
      await document.save();
      throw ApiError.badRequest(`Could not process the document: ${error.message}`);
    }
  }),
);

router.get(
  '/documents',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const documents = await KnowledgeDocument.find({ tenantId })
      .select('-extractedText')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return ok(res, documents.map((doc) => ({ ...doc, id: String(doc._id) })));
  }),
);

router.delete(
  '/documents/:id',
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantId(req);
    const document = await KnowledgeDocument.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!document) throw ApiError.notFound('Document not found');
    const removed = await KnowledgeEntry.deleteMany({ tenantId, documentId: document._id });
    await Subscription.updateOne({ tenantId }, { $inc: { 'usage.knowledgeEntries': -removed.deletedCount } });
    await audit(req, {
      action: 'knowledge.document_deleted',
      entity: 'KnowledgeDocument',
      entityId: document._id,
      severity: 'warning',
      meta: { entries: removed.deletedCount },
    });
    return ok(res, { message: 'Document and its entries removed', entriesRemoved: removed.deletedCount });
  }),
);

export default router;
