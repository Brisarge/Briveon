// Turns selected tasks and notes into a prompt to paste into Claude.
// No AI service is called: everything happens in this page.

export const PROMPTS_FOLDER = 'Prompts/';
export const RULES_PATH = 'Prompts/Project Rules.md';

const READ_ONLY_LINE =
  'The notes below are a read-only reference. Don\'t edit vault files. If a note should change, write the suggested text in your reply.';

export const STARTER_TEMPLATES = [
  {
    name: 'Generate Luau ModuleScript',
    body: `You're helping build a Roblox game in Luau.

Write a ModuleScript for the request below. Follow the existing patterns shown in the notes. Include the full script, where it should live in the game tree, and how other scripts should call it. Point out anything that must run on the server rather than the client.

${READ_ONLY_LINE}

{{rules}}
{{tasks}}
{{notes}}
{{request}}`,
  },
  {
    name: 'Refactor Gameplay Logic',
    body: `You're helping refactor gameplay code in a Roblox game written in Luau.

Keep the behavior the same unless the request says otherwise. Start by listing what you'd change and why, then show the updated code. Call out anything that could break live player data or existing saves.

${READ_ONLY_LINE}

{{rules}}
{{tasks}}
{{notes}}
{{request}}`,
  },
  {
    name: 'Find a Bug',
    body: `You're helping track down a bug in a Roblox game written in Luau.

List the most likely causes in order, how to confirm each one, and the smallest fix. Don't guess at code you can't see; ask for it instead.

${READ_ONLY_LINE}

{{rules}}
{{tasks}}
{{notes}}
{{request}}`,
  },
  {
    name: 'Draft Spec Note',
    body: `You're helping write a design spec for a Roblox game.

Write a Markdown note with the goal, how it works for the player, the systems involved, edge cases, and open questions. Keep it short enough that it gets read. Use [[Note Name]] links when you refer to the notes below.

${READ_ONLY_LINE}

{{rules}}
{{tasks}}
{{notes}}
{{request}}`,
  },
];

const STATUS = { todo: 'To do', doing: 'Doing', done: 'Done' };

function taskSection(tasks) {
  if (!tasks.length) return '';
  const blocks = tasks.map(({ task, comments, linkedPaths, nameOf }) => {
    const lines = [`Title: ${task.title}`, `Status: ${STATUS[task.status] || task.status}`];
    if (task.assignee) lines.push(`Assigned to: ${task.assignee}`);
    if (task.project) lines.push(`Project: ${task.project}`);
    if (linkedPaths.length) lines.push(`Linked notes: ${linkedPaths.join(', ')}`);
    if (task.notes) lines.push('Details:', task.notes);
    if (comments.length) {
      lines.push('Discussion:', ...comments.map((c) => `- ${nameOf(c.author)}: ${c.body}`));
    }
    return `<task>\n${lines.join('\n')}\n</task>`;
  });
  return `<tasks>\n${blocks.join('\n')}\n</tasks>`;
}

function noteSection(notes) {
  if (!notes.length) return '';
  const blocks = notes.map((n) => `<note path="${n.path}">\n${n.content.trim()}\n</note>`);
  return `<notes>\n${blocks.join('\n')}\n</notes>`;
}

export function buildPrompt({ template, request, tasks, notes, rules }) {
  const sections = {
    rules: rules?.trim() ? `<project_rules>\n${rules.trim()}\n</project_rules>` : '',
    tasks: taskSection(tasks),
    notes: noteSection(notes),
    request: request?.trim() ? `<request>\n${request.trim()}\n</request>` : '',
  };

  const used = new Set();
  // One pass, so text inside a note that looks like {{request}} is left alone.
  let out = template.replace(/^[ \t]*\{\{(\w+)\}\}[ \t]*\r?\n?|\{\{(\w+)\}\}/gm, (match, whole, inline) => {
    const key = whole || inline;
    if (!(key in sections)) return match;
    used.add(key);
    const value = sections[key];
    if (whole) return value ? `${value}\n` : '';
    return value;
  });

  // A custom template that skips a placeholder still gets the selected content.
  for (const key of Object.keys(sections)) {
    if (!used.has(key) && sections[key]) out = `${out.trimEnd()}\n\n${sections[key]}`;
  }
  return out.trim();
}

// A rough guide only: English text averages about four characters per token.
export const estimateTokens = (text) => Math.ceil(text.length / 4);
