// Small DOM helpers shared by every HQ tool.

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

export const store = {
  get(key, fallback) {
    try {
      return localStorage.getItem(`hq.${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`hq.${key}`, value);
    } catch {
      /* private mode etc. */
    }
  },
};

let toastTimer;
export function toast(message, ms = 4000) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), ms);
}

export function friendly(err) {
  const msg = err?.message || String(err);
  if (err?.code === '42501' || err?.code === 'PGRST116' || /row-level security/i.test(msg)) {
    return 'Not allowed. Is your email in the admins table? (README, Admin setup)';
  }
  if (err?.code === '23505') return 'A note with that path already exists.';
  if (err?.code === '23514') return "That isn't allowed here (check the name or length).";
  if (/failed to fetch|networkerror/i.test(msg)) return 'Network error. Check your connection and try again.';
  return msg;
}

export function isMissingTable(err) {
  const msg = err?.message || '';
  return (
    err?.code === 'PGRST205' ||
    err?.code === '42P01' ||
    err?.code === '42703' ||
    /does not exist|could not find the table/i.test(msg)
  );
}

export function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

// A simple dialog. Resolves with the clicked button's value, or null if dismissed.
//   buttons: [{ label, value, primary, danger }]
export function modal({ title, body, buttons = [], wide = false, onOpen }) {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: `hq-modal${wide ? ' hq-modal-wide' : ''}` });
    const close = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };

    const footer = el(
      'footer',
      {},
      buttons.map((b) => {
        const cls = `btn${b.primary ? ' btn-primary' : ''}${b.danger ? ' btn-danger' : ''}`;
        const btn = el('button', { class: cls, type: b.submit ? 'submit' : 'button', text: b.label });
        if (!b.submit) btn.addEventListener('click', () => close(b.value ?? null));
        return btn;
      }),
    );

    const closeBtn = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', text: '✕' });
    closeBtn.addEventListener('click', () => close(null));

    dialog.append(
      el('header', {}, [el('h2', { text: title }), closeBtn]),
      el('div', { class: 'hq-modal-body' }, body),
      footer,
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close(null);
    });

    document.body.append(dialog);
    dialog.showModal();
    onOpen?.(dialog, close);
  });
}

export function confirmModal(title, message, confirmLabel = 'Delete') {
  return modal({
    title,
    body: el('p', { class: 'muted', text: message }),
    buttons: [
      { label: 'Cancel', value: false },
      { label: confirmLabel, value: true, danger: true },
    ],
  });
}
