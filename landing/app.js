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

// ---------- fallback (sem motion / reduced motion) ----------
function fallbackReveal() {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
  document.querySelectorAll('.terminal .tline').forEach((el) => (el.style.opacity = 1));
  document.querySelectorAll('.counter').forEach((el) => {
    el.textContent = (Number(el.dataset.target || 0)) + (el.dataset.suffix || '');
  });
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

  // 1) Entrada do hero em cascata (badge → título → sub → CTAs → terminal)
  const heroEls = [...document.querySelectorAll('.hero .reveal')];
  if (heroEls.length) {
    animate(
      heroEls,
      { opacity: [0, 1], y: [30, 0] },
      { delay: stagger(0.1), duration: 0.85, easing: EASE },
    );
  }

  // 2) Linhas do terminal aparecem em sequência (efeito "digitando")
  const tlines = document.querySelectorAll('.terminal .tline');
  if (tlines.length) {
    animate(
      tlines,
      { opacity: [0, 1], x: [14, 0] },
      { delay: stagger(0.16, { start: 0.75 }), duration: 0.35, easing: EASE },
    );
  }

  // 3) Reveals das demais seções (uma vez, ao entrar na viewport)
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

  // 4) Contadores animados (faixa de estatísticas)
  document.querySelectorAll('.counter').forEach((el) => {
    const target = Number(el.dataset.target || 0);
    const suffix = el.dataset.suffix || '';
    inView(
      el,
      () => {
        if (target === 0) {
          el.textContent = '0' + suffix;
          return;
        }
        const proxy = { v: 0 };
        animate(proxy, { v: target }, {
          duration: 1.4,
          easing: EASE,
          onUpdate: () => {
            el.textContent = Math.round(proxy.v) + suffix;
          },
        });
      },
      { amount: 0.6, once: true },
    );
  });

  // 5) Efeitos scroll-linked
  // barra de progresso no topo
  const progress = document.getElementById('progress');
  if (progress) scroll(animate(progress, { scaleX: [0, 1] }));

  // parallax do fundo do hero (grid + orbs descem mais devagar)
  const heroBg = document.querySelector('.hero .hero-bg');
  if (heroBg && hero) {
    scroll(animate(heroBg, { y: [0, 140] }), { target: hero, offset: ['start start', 'end start'] });
  }

  // parallax do terminal (sobe sutilmente ao rolar)
  const vis = document.querySelector('.hero-visual');
  if (vis && hero) {
    scroll(animate(vis, { y: [0, -46] }), { target: hero, offset: ['start start', 'end start'] });
  }
}

initMotion();
