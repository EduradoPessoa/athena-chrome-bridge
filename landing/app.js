// ====================================================================
// Athena Chrome Bridge — Landing Page (interações com Motion)
// Usa a biblioteca "motion" (motion.dev, v13) via CDN — a sucessora do
// Motion One, base do Framer Motion, para JS puro (sem build).
// Se o CDN falhar, tudo cai num fallback estático (página continua 100% funcional).
// ====================================================================
const MOTION_URL = 'https://cdn.jsdelivr.net/npm/motion@13.1.0/+esm';
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = [0.22, 1, 0.36, 1]; // ease-out expo

// ---------- menu mobile (independe de motion) ----------
const menuBtn = document.getElementById('menuBtn');
const navLinks = document.getElementById('navLinks');

menuBtn.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach((a) =>
  a.addEventListener('click', () => navLinks.classList.remove('open')),
);

// ---------- micro-interação: clicar no 🦉 reabre o painel do mockup ----------
const heroFab = document.getElementById('heroFab');
const heroPanel = document.getElementById('heroPanel');

if (heroFab && heroPanel) {
  heroFab.addEventListener('click', () => {
    heroPanel.style.animation = 'none';
    void heroPanel.offsetWidth; // reinicia a animação
    heroPanel.style.animation = '';
  });
}

// ---------- fallback (sem motion / reduced motion) ----------
function fallbackReveal() {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
}

// ---------- animações com Motion ----------
async function initMotion() {
  if (prefersReduced) {
    fallbackReveal();
    return;
  }

  let motion;
  try {
    motion = await import(MOTION_URL);
  } catch (e) {
    console.warn('[athena] motion não carregou — usando fallback estático.', e);
    fallbackReveal();
    return;
  }

  const { animate, inView, scroll, stagger } = motion;
  const hero = document.querySelector('.hero');

  // 1) Entrada do hero em cascata (eyebrow → título → sub → CTAs → mockup)
  const heroEls = [...document.querySelectorAll('.hero .reveal')];
  if (heroEls.length) {
    animate(
      heroEls,
      { opacity: [0, 1], y: [26, 0] },
      { delay: stagger(0.09), duration: 0.8, easing: EASE },
    );
  }

  // 2) Reveals das demais seções (uma vez, ao entrar na viewport)
  const restEls = [...document.querySelectorAll('.reveal')].filter(
    (el) => !el.closest('.hero'),
  );
  restEls.forEach((el) => {
    inView(
      el,
      () => {
        animate(el, { opacity: [0, 1], y: [26, 0] }, { duration: 0.75, easing: EASE });
      },
      { amount: 0.15, once: true },
    );
  });

  // 3) Efeitos scroll-linked
  // barra de progresso no topo
  const progress = document.getElementById('progress');
  if (progress) scroll(animate(progress, { scaleX: [0, 1] }));

  // parallax da aurora (fundo desce mais devagar)
  const aurora = document.querySelector('.hero .aurora');
  if (aurora && hero) {
    scroll(animate(aurora, { y: [0, 130] }), { target: hero, offset: ['start start', 'end start'] });
  }

  // parallax do mockup (sobe sutilmente ao rolar)
  const vis = document.querySelector('.hero-visual');
  if (vis && hero) {
    scroll(animate(vis, { y: [0, -46] }), { target: hero, offset: ['start start', 'end start'] });
  }
}

initMotion();
