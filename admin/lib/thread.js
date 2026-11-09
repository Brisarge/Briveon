// A discussion thread for one task or one note.

import { el, toast, friendly, timeAgo, confirmModal } from './ui.js';
import { renderInto, handleLinkClick, loadMarkdown } from './markdown.js';

const MAX_COMMENT = 10000;

// target is { task_id } or { note_id }
export function createThread(ctx, target) {
  const list = el('div', { class: 'thread-list' });
  const input = el('textarea', {
    class: 'thread-input',
    rows: '3',
    maxlength: String(MAX_COMMENT),
    placeholder: 'Write a comment. Markdown and [[note links]] work.',
    'aria-label': 'Write a comment',
  });
  const post = el('button', { class: 'btn btn-primary btn-small', type: 'button', text: 'Comment' });
  const hint = el('span', { class: 'thread-hint', text: 'Ctrl+Enter to post' });
  const root = el('div', { class: 'thread' }, [
    list,
    el('div', { class: 'thread-compose' }, [input, el('div', { class: 'thread-actions' }, [hint, post])]),
  ]);

  const matches = (c) => (target.task_id ? c.task_id === target.task_id : c.note_id === target.note_id);
  const linkHelpers = {
    resolveLink: (name) => ctx.resolveNote(name),
    openNote: (id) => ctx.openNote(id),
    missing: (name) => toast(`No note called ${name}`),
  };

  const refresh = () => {
    const comments = [...ctx.data.comments.values()]
      .filter(matches)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    list.replaceChildren(
      ...(comments.length ? [] : [el('p', { class: 'thread-empty', text: 'No comments yet.' })]),
      ...comments.map((c) => {
        const body = el('div', { class: 'comment-body md' });
        renderInto(body, c.body, linkHelpers.resolveLink);
        const head = el('header', { class: 'comment-head' }, [
          el('b', { text: ctx.nameOf(c.author) }),
          el('time', { datetime: c.created_at, title: new Date(c.created_at).toLocaleString(), text: timeAgo(c.created_at) }),
        ]);
        if (c.author === ctx.user?.id) {
          const del = el('button', { class: 'comment-delete', type: 'button', text: 'Delete' });
          del.addEventListener('click', () => remove(c));
          head.append(del);
        }
        return el('article', { class: 'comment' }, [head, body]);
      }),
    );
  };

  const remove = async (comment) => {
    if (!(await confirmModal('Delete comment', 'Delete this comment? This can\'t be undone.'))) return;
    try {
      await ctx.api.removeComment(comment.id);
      ctx.data.comments.delete(comment.id);
      ctx.changed();
    } catch (err) {
      toast(friendly(err), 6000);
    }
  };

  const submit = async () => {
    const body = input.value.trim();
    if (!body) return;
    post.disabled = true;
    try {
      const row = await ctx.api.addComment({ ...target, body });
      ctx.data.comments.set(row.id, row);
      input.value = '';
      ctx.changed();
      list.lastElementChild?.scrollIntoView({ block: 'nearest' });
    } catch (err) {
      toast(friendly(err), 6000);
    } finally {
      post.disabled = false;
    }
  };

  post.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  list.addEventListener('click', (e) => handleLinkClick(e, linkHelpers));

  loadMarkdown().then(refresh, () => {});
  refresh();
  return { el: root, refresh, focus: () => input.focus() };
}

// A search box with a list of results to pick from.
export function createPicker({ placeholder, items, onPick }) {
  const input = el('input', { type: 'search', placeholder, 'aria-label': placeholder, autocomplete: 'off' });
  const results = el('div', { class: 'picker-results' });
  const refresh = () => {
    const q = input.value.trim().toLowerCase();
    const hits = items()
      .filter((i) => !q || i.label.toLowerCase().includes(q) || i.sub?.toLowerCase().includes(q))
      .slice(0, 8);
    results.replaceChildren(
      ...(hits.length
        ? hits.map((item) => {
            const btn = el('button', { class: 'picker-item', type: 'button' }, [
              el('span', { text: item.label }),
              item.sub ? el('small', { text: item.sub }) : null,
            ]);
            btn.addEventListener('click', () => onPick(item));
            return btn;
          })
        : [el('p', { class: 'thread-empty', text: 'Nothing to link.' })]),
    );
  };
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      results.querySelector('.picker-item')?.click();
    }
  });
  refresh();
  return { el: el('div', { class: 'picker' }, [input, results]), refresh, focus: () => input.focus() };
}
