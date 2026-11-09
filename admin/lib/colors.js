// Color coding: a task's own color wins, otherwise it uses its project's color.

import { el } from './ui.js';

export const PALETTE = [
  { name: 'Lime', hex: '#8bc641' },
  { name: 'Yellow', hex: '#e8c547' },
  { name: 'Orange', hex: '#f08a3c' },
  { name: 'Red', hex: '#ef5a5a' },
  { name: 'Pink', hex: '#ec6fb0' },
  { name: 'Purple', hex: '#a47bf0' },
  { name: 'Blue', hex: '#5b9df5' },
  { name: 'Cyan', hex: '#3fc9c9' },
];

// Projects without a chosen color still get a stable one.
export function defaultProjectColor(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length].hex;
}

export function projectColor(name, projects) {
  if (!name) return null;
  return projects.get(name) || defaultProjectColor(name);
}

export function taskColor(task, projects) {
  return task.color || projectColor(task.project, projects);
}

// A row of color buttons. With noneLabel, the first button clears the color.
export function swatchPicker({ value = null, noneLabel = null, label, onChange }) {
  const row = el('div', { class: 'swatches', role: 'group', 'aria-label': label });
  let current = value;

  const add = (hex, name) => {
    const btn = el('button', {
      class: `swatch${hex ? '' : ' swatch-none'}`,
      type: 'button',
      title: name,
      'aria-label': name,
      'aria-pressed': String((current || null) === hex),
      'data-color': hex || '',
    });
    if (hex) btn.style.setProperty('--swatch', hex);
    else btn.textContent = noneLabel;
    btn.addEventListener('click', () => {
      current = hex;
      row.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      onChange?.(hex);
    });
    row.append(btn);
  };

  if (noneLabel) add(null, noneLabel);
  for (const c of PALETTE) add(c.hex, c.name);
  if (value && !PALETTE.some((c) => c.hex.toLowerCase() === value.toLowerCase())) add(value, value);
  return row;
}
