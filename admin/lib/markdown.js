// Markdown rendering shared by the vault and discussion threads.
// Notes and comments are shared text, so nothing in them may run in this logged-in page.

const MARKED_CDN = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/+esm';
const PURIFY_CDN = 'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/+esm';

let renderer = null;
let loading = null;

export function loadMarkdown() {
  if (loading) return loading;
  loading = Promise.all([import(MARKED_CDN), import(PURIFY_CDN)]).then(([{ marked }, purify]) => {
    const DOMPurify = purify.default;
    const esc = (s) =>
      s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    marked.use({
      gfm: true,
      breaks: true,
      extensions: [
        {
          name: 'wikilink',
          level: 'inline',
          start: (src) => src.indexOf('[['),
          tokenizer(src) {
            const m = /^!?\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/.exec(src);
            if (m) return { type: 'wikilink', raw: m[0], target: m[1].trim(), text: (m[2] || m[1]).trim() };
            return undefined;
          },
          renderer: (t) => `<a class="wikilink" href="#" data-note="${esc(t.target)}">${esc(t.text)}</a>`,
        },
      ],
    });

    renderer = (source) => {
      const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      return DOMPurify.sanitize(marked.parse(body), {
        FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed', 'button', 'textarea', 'select'],
        FORBID_ATTR: ['style'],
      });
    };
  });
  return loading;
}

// Fills an element with rendered Markdown. Plain text until the library has loaded.
export function renderInto(element, source, resolveLink) {
  if (!renderer) {
    element.textContent = source;
    return;
  }
  element.innerHTML = renderer(source);
  element.querySelectorAll('a').forEach((a) => {
    if (a.classList.contains('wikilink')) {
      if (!resolveLink(a.dataset.note)) a.classList.add('missing');
    } else if (/^https?:/i.test(a.getAttribute('href') || '')) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  });
}

// Handles clicks on links inside rendered Markdown. Returns true if it opened something.
export function handleLinkClick(event, { resolveLink, openNote, missing }) {
  const a = event.target.closest('a');
  if (!a) return;
  if (a.classList.contains('wikilink')) {
    event.preventDefault();
    const target = resolveLink(a.dataset.note);
    if (target) openNote(target.id);
    else missing?.(a.dataset.note.split('#')[0].trim());
    return;
  }
  const href = a.getAttribute('href') || '';
  if (/^(https?:|mailto:|#)/i.test(href)) return;
  // Regular Markdown links between notes, like [Spec](Specs/Combat.md)
  event.preventDefault();
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    /* keep it as written */
  }
  const target = resolveLink(decoded);
  if (target) openNote(target.id);
  else missing?.(decoded);
}
