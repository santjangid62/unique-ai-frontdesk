import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, PageHeader } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import guideSource from '../../../docs/AI_TRAINING_GUIDE.md?raw';

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function inline(text, keyPrefix = 'i') {
  const nodes = [];
  let last = 0;
  let match;
  let index = 0;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-700">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <strong key={key} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));

  return nodes.map((node, position) => (typeof node === 'string' ? <Fragment key={`${keyPrefix}-s${position}`}>{node}</Fragment> : node));
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

const LIST_ITEM = /^([-*]|\d+\.)\s+(.*)$/;

function startsBlock(line) {
  const text = line.trim();
  if (!text) return true;
  return (
    text.startsWith('```') ||
    text.startsWith('|') ||
    text.startsWith('>') ||
    /^(#{1,6})\s/.test(text) ||
    /^-{3,}$/.test(text) ||
    LIST_ITEM.test(text)
  );
}

function parseBlocks(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  let counter = 0;
  const nextKey = () => `b${counter++}`;

  while (i < lines.length) {
    const line = lines[i];
    const text = line.trim();
    if (!text) {
      i += 1;
      continue;
    }

    if (text.startsWith('```')) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      const key = nextKey();
      blocks.push(
        <pre key={key} className="mb-4 overflow-x-auto rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed text-slate-100">
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(text);
    if (heading) {
      const level = heading[1].length;
      const key = nextKey();
      const content = inline(heading[2], `h${key}`);
      if (level === 2) {
        blocks.push(
          <h2 key={key} className="mb-3 mt-8 border-b border-slate-100 pb-2 text-lg font-bold tracking-tight text-slate-900 first:mt-0">
            {content}
          </h2>,
        );
      } else if (level === 3) {
        blocks.push(
          <h3 key={key} className="mb-2 mt-6 text-base font-semibold text-slate-900">
            {content}
          </h3>,
        );
      } else if (level >= 4) {
        blocks.push(
          <h4 key={key} className="mb-1.5 mt-4 text-sm font-semibold text-slate-900">
            {content}
          </h4>,
        );
      }
      i += 1;
      continue;
    }

    if (/^-{3,}$/.test(text)) {
      blocks.push(<hr key={nextKey()} className="my-6 border-slate-100" />);
      i += 1;
      continue;
    }

    if (text.startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1].trim()) && lines[i + 1].includes('-')) {
      const header = splitRow(text);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i].trim()));
        i += 1;
      }
      const key = nextKey();
      blocks.push(
        <div key={key} className="mb-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50">
              <tr>
                {header.map((cell, column) => (
                  <th key={column} className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-700">
                    {inline(cell, `${key}-h${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="align-top">
                  {row.map((cell, column) => (
                    <td key={column} className="border-b border-slate-100 px-3 py-2 text-slate-600">
                      {inline(cell, `${key}-r${rowIndex}c${column}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (text.startsWith('>')) {
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const key = nextKey();
      blocks.push(
        <div key={key} className="mb-4 rounded-xl border-l-4 border-brand-200 bg-brand-50/60 px-4 py-3 text-slate-700">
          {inline(quote.join(' '), `q${key}`)}
        </div>,
      );
      continue;
    }

    const listItem = LIST_ITEM.exec(text);
    if (listItem) {
      const ordered = /\d/.test(listItem[1]);
      const items = [];
      while (i < lines.length) {
        const item = LIST_ITEM.exec(lines[i].trim());
        if (!item) break;
        let itemText = item[2];
        let checked = null;
        const checkbox = /^\[([ xX])\]\s+(.*)$/.exec(itemText);
        if (checkbox) {
          checked = checkbox[1].toLowerCase() === 'x';
          itemText = checkbox[2];
        }
        items.push({ text: itemText, checked });
        i += 1;
      }
      const key = nextKey();
      const hasChecklist = items.some((item) => item.checked !== null);
      const content = items.map((item, position) => (
        <li key={position} className={hasChecklist ? 'flex gap-2' : undefined}>
          {item.checked === null ? null : (
            <span
              className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] font-bold ${
                item.checked ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 text-transparent'
              }`}
            >
              ✓
            </span>
          )}
          <span>{inline(item.text, `${key}-${position}`)}</span>
        </li>
      ));
      blocks.push(
        ordered ? (
          <ol key={key} className="mb-3 list-decimal space-y-1 pl-5">
            {content}
          </ol>
        ) : (
          <ul key={key} className={`mb-3 space-y-1 pl-5 ${hasChecklist ? 'list-none pl-1' : 'list-disc'}`}>
            {content}
          </ul>
        ),
      );
      continue;
    }

    const paragraph = [];
    while (i < lines.length && !startsBlock(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (!paragraph.length) {
      paragraph.push(text);
      i += 1;
    }
    const key = nextKey();
    blocks.push(
      <p key={key} className="mb-3">
        {inline(paragraph.join(' '), `p${key}`)}
      </p>,
    );
  }

  return blocks;
}

export default function Guide() {
  const { isSuperAdmin } = useAuth();
  const blocks = useMemo(() => parseBlocks(guideSource), []);

  return (
    <div>
      <PageHeader
        eyebrow="Documentation"
        title="AI Training Guide"
        subtitle="Step-by-step guide to training the AI receptionist for your business — read-only."
        actions={
          <Link to={isSuperAdmin ? '/app' : '/app/settings'} className="btn-secondary">
            <ArrowLeft size={16} /> {isSuperAdmin ? 'Back to console' : 'Business Settings'}
          </Link>
        }
      />
      <Card className="p-5 sm:p-8">
        <article className="max-w-4xl text-sm leading-relaxed text-slate-700">{blocks}</article>
      </Card>
    </div>
  );
}
