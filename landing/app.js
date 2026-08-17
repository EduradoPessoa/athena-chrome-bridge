// ====================================================================
// Athena Chrome Bridge — Landing Page (interações)
// ====================================================================

// ---------- menu mobile ----------
const menuBtn = document.getElementById('menuBtn');
const navLinks = document.getElementById('navLinks');

menuBtn.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach((a) =>
  a.addEventListener('click', () => navLinks.classList.remove('open')),
);

// ---------- reveals ao rolar ----------
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
);
revealEls.forEach((el) => io.observe(el));

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
