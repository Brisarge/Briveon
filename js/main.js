import { projects, links, tracks } from './content.js';

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

// ---------- Project cover art (used when a project has no image) ----------

const PANEL = '#0d1209';
const MOTIFS = {
  cards: `<svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
    <rect x="30" y="16" width="32" height="46" rx="4" transform="rotate(-16 46 39)" fill="${PANEL}"/>
    <rect x="58" y="16" width="32" height="46" rx="4" transform="rotate(16 74 39)" fill="${PANEL}"/>
    <rect x="44" y="11" width="32" height="46" rx="4" fill="${PANEL}"/>
    <path d="M60 24l7 10-7 10-7-10z" fill="currentColor"/>
  </svg>`,
  bars: `<svg viewBox="0 0 120 80" fill="currentColor" aria-hidden="true">
    ${[18, 34, 52, 30, 62, 44, 24, 48, 36, 20]
      .map((h, i) => `<rect x="${10 + i * 10.4}" y="${70 - h}" width="6" height="${h}" rx="1.5" opacity="${0.45 + (h / 62) * 0.55}"/>`)
      .join('')}
  </svg>`,
  orbits: `<svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
    <ellipse cx="60" cy="40" rx="28" ry="12" transform="rotate(-12 60 40)" opacity=".7"/>
    <ellipse cx="60" cy="40" rx="50" ry="24" transform="rotate(-12 60 40)" opacity=".45"/>
    <circle cx="60" cy="40" r="8" fill="currentColor"/>
    <circle cx="86" cy="35" r="3.5" fill="currentColor"/>
    <circle cx="14" cy="52" r="4.5" fill="currentColor"/>
  </svg>`,
  climb: `<svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 72h18V60h18V48h18V36h18V24h18" />
    <rect x="70" y="6" width="9" height="9" transform="rotate(20 74 10)" fill="currentColor"/>
    <rect x="48" y="16" width="7" height="7" transform="rotate(-25 51 19)" fill="currentColor" opacity=".7"/>
    <rect x="94" y="2" width="6" height="6" transform="rotate(35 97 5)" fill="currentColor" opacity=".5"/>
  </svg>`,
  tower: `<svg viewBox="0 0 120 80" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
    <path d="M24 74h72" opacity=".5"/>
    <rect x="42" y="58" width="36" height="16" fill="${PANEL}"/>
    <rect x="45" y="42" width="30" height="16" fill="${PANEL}"/>
    <rect x="49" y="27" width="22" height="15" transform="rotate(-6 60 34)" fill="${PANEL}"/>
    <rect x="58" y="6" width="16" height="13" transform="rotate(24 66 12)" fill="currentColor"/>
    <rect x="84" y="20" width="6" height="6" transform="rotate(40 87 23)" fill="currentColor" opacity=".7"/>
    <rect x="34" y="16" width="5" height="5" transform="rotate(-30 36 18)" fill="currentColor" opacity=".5"/>
  </svg>`,
};

function cover(project) {
  const node = el('div', { class: 'cover' });
  if (project.image) {
    node.append(el('img', { src: project.image, alt: '', loading: 'lazy' }));
  } else {
    node.innerHTML = MOTIFS[project.motif] || MOTIFS.cards;
  }
  return node;
}

function isExternal(url) {
  return /^https?:\/\//.test(url);
}

function linkAttrs(url) {
  return isExternal(url) ? { href: url, target: '_blank', rel: 'noopener' } : { href: url };
}

function cardBody(project, { featured = false } = {}) {
  const body = el('div', { class: 'card-body' });

  if (project.platform || project.status) {
    const meta = el('p', { class: 'meta' });
    if (project.platform) meta.append(project.platform);
    if (project.platform && project.status) meta.append(' · ');
    if (project.status) meta.append(el('span', { class: 'status', text: project.status }));
    body.append(meta);
  }

  const title = el('h3');
  if (project.link && !featured) title.append(el('a', { ...linkAttrs(project.link), text: project.title }));
  else title.textContent = project.title;
  body.append(title);

  if (project.blurb) body.append(el('p', { class: 'blurb', text: project.blurb }));
  if (project.role) body.append(el('p', { class: 'role', text: project.role }));
  if (project.tags?.length) {
    body.append(el('ul', { class: 'tags' }, project.tags.map((t) => el('li', { text: t }))));
  }
  if (featured && project.link) {
    body.append(el('a', { class: 'btn btn-primary', ...linkAttrs(project.link), text: project.linkLabel || 'Play' }));
  }
  return body;
}

function renderProjects() {
  const featured = projects.find((p) => p.featured);
  const rest = projects.filter((p) => p !== featured);

  if (featured) {
    $('#featured').replaceWith(
      el('article', { class: 'featured', 'data-reveal': '' }, [cover(featured), cardBody(featured, { featured: true })]),
    );
  }

  const grid = $('#project-grid');
  rest.forEach((project, i) => {
    const card = el('article', { class: 'card', 'data-reveal': '' }, [cover(project), cardBody(project)]);
    card.style.transitionDelay = `${(i % 4) * 70}ms`;
    grid.append(card);
  });
}

function renderLinks() {
  const list = $('#contact-links');
  links
    .filter((l) => l.url)
    .forEach((l, i) => {
      const cls = i === 0 ? 'btn btn-primary' : 'btn';
      list.append(el('li', {}, el('a', { class: cls, ...linkAttrs(l.url), text: l.label })));
    });
}

// ---------- Nav ----------

function setupNav() {
  const nav = $('#nav');
  const toggle = $('#nav-toggle');

  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Close' : 'Menu';
  };

  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  $('#nav-links').addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });

  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ---------- Scroll reveal ----------

function setupReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    items.forEach((n) => n.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  );
  items.forEach((n) => io.observe(n));
}

// ---------- Lab (visualizer) ----------

function setupLab() {
  const stage = $('#lab-stage');
  const playBtn = $('#lab-play');
  const toggleBtn = $('#lab-toggle');
  const stopBtn = $('#lab-stop');
  const status = $('#lab-status');
  const trackList = $('#lab-tracks');

  // Static poster shown before the visualizer starts.
  const poster = $('#lab-poster');
  for (let i = 0; i < 24; i++) {
    const h = 16 + 64 * (0.5 + 0.5 * Math.sin(i * 0.55)) * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7)));
    const bar = el('span');
    bar.style.setProperty('--h', `${h.toFixed(1)}%`);
    poster.append(bar);
  }

  let current = 0;
  let viz = null;
  let modulePromise = null;
  const loadModule = () => (modulePromise ||= import('./visualizer.js'));

  // Fetch three.js before the click, so audio starts inside the click.
  if ('IntersectionObserver' in window) {
    const pre = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadModule().catch(() => {});
          pre.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    pre.observe(stage);
  }

  const trackButtons = tracks.map((track, i) => {
    const btn = el('button', { class: 'btn', type: 'button', 'aria-pressed': String(i === current), text: track.name });
    btn.addEventListener('click', () => {
      current = i;
      trackButtons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
      if (viz) {
        viz.setTrack(track.src);
        if (viz.playing) status.textContent = `Now playing · ${track.name}`;
      }
    });
    trackList.append(btn);
    return btn;
  });

  const setPlayingUI = (playing) => {
    stage.classList.toggle('playing', playing || stage.classList.contains('playing'));
    toggleBtn.disabled = false;
    stopBtn.disabled = false;
    toggleBtn.textContent = playing ? 'Pause' : 'Play';
    status.textContent = playing ? `Now playing · ${tracks[current].name}` : 'Paused';
  };

  playBtn.addEventListener('click', async () => {
    stage.classList.add('loading');
    status.textContent = 'Loading…';
    try {
      const mod = await loadModule();
      viz ||= mod.createVisualizer(stage);
      await viz.play(tracks[current].src);
      stage.classList.add('playing');
      setPlayingUI(true);
    } catch (err) {
      console.error(err);
      status.textContent = `Couldn't start the visualizer: ${err.message}`;
    } finally {
      stage.classList.remove('loading');
    }
  });

  toggleBtn.addEventListener('click', async () => {
    if (!viz) return;
    if (viz.playing) {
      viz.pause();
      setPlayingUI(false);
    } else {
      try {
        await viz.play(tracks[current].src);
        setPlayingUI(true);
      } catch (err) {
        status.textContent = `Couldn't resume: ${err.message}`;
      }
    }
  });

  stopBtn.addEventListener('click', () => {
    if (!viz) return;
    viz.stop();
    stage.classList.remove('playing');
    toggleBtn.disabled = true;
    stopBtn.disabled = true;
    toggleBtn.textContent = 'Pause';
    status.textContent = '';
  });

  // Skip rendering while the stage is off screen (music keeps playing).
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      for (const entry of entries) viz?.setVisible(entry.isIntersecting);
    }).observe(stage);
  }
}

// ---------- Boot ----------

renderProjects();
renderLinks();
setupNav();
setupReveal();
setupLab();
$('#year').textContent = new Date().getFullYear();
requestAnimationFrame(() => document.documentElement.classList.add('loaded'));
