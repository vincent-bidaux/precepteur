// Glisser-déposer pour remettre une liste dans l'ordre, au doigt comme à la
// souris (Pointer Events : le glisser-déposer HTML5 natif ne marche pas au
// doigt sur mobile). Au clavier : focus sur une étiquette puis flèches ↑ ↓.

/**
 * @param {HTMLElement} list  conteneur des éléments `.order-item`
 * @param {{ onChange: () => void, isLocked: () => boolean }} opts
 */
export function makeSortable(list, { onChange, isLocked }) {
  let drag = null;

  const midY = (el) => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  };

  list.addEventListener("pointerdown", (e) => {
    const item = e.target.closest(".order-item");
    if (!item || isLocked() || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault(); // pas de sélection de texte ni de défilement
    item.setPointerCapture?.(e.pointerId);
    drag = { item, id: e.pointerId, startY: e.clientY, grab: e.clientY - item.getBoundingClientRect().top, moved: false };
  });

  list.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.abs(e.clientY - drag.startY) < 4) return;
      drag.moved = true;
      drag.item.classList.add("dragging");
      list.classList.add("sorting");
    }
    const { item } = drag;
    const center = e.clientY - drag.grab + item.offsetHeight / 2;
    // l'étiquette passe devant / derrière ses voisines quand son centre dépasse leur milieu
    while (item.previousElementSibling && center < midY(item.previousElementSibling)) list.insertBefore(item, item.previousElementSibling);
    while (item.nextElementSibling && center > midY(item.nextElementSibling)) list.insertBefore(item.nextElementSibling, item);
    // elle reste collée sous le doigt
    item.style.transform = "";
    item.style.transform = `translateY(${e.clientY - drag.grab - item.getBoundingClientRect().top}px)`;
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { item, moved } = drag;
    drag = null;
    item.style.transform = "";
    item.classList.remove("dragging");
    list.classList.remove("sorting");
    if (moved) onChange();
  };
  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);

  list.addEventListener("keydown", (e) => {
    const item = e.target.closest(".order-item");
    if (!item || isLocked() || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && item.previousElementSibling) list.insertBefore(item, item.previousElementSibling);
    else if (e.key === "ArrowDown" && item.nextElementSibling) list.insertBefore(item.nextElementSibling, item);
    else return;
    item.focus();
    onChange();
  });
}
