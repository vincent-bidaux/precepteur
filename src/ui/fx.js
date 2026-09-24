// Petite pluie de confettis (sans bibliothèque), désactivée si l'utilisateur
// préfère réduire les animations.
export function confetti(n = 90) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#f59e0b", "#2563eb", "#c026d3", "#16a34a", "#ef4444", "#eab308"];
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.6 + "s";
    p.style.animationDuration = 2 + Math.random() * 1.5 + "s";
    p.style.setProperty("--drift", (Math.random() - 0.5) * 200 + "px");
    p.style.setProperty("--spin", Math.random() * 720 + "deg");
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 4500);
}
