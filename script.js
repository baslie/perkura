/* Слайдер первого экрана: шаг считаем от фактических размеров, они резиновые. */
const track = document.querySelector(".hero__track");

if (track) {
  const slides = track.querySelectorAll(".slide");
  let index = 0;

  const step = () => slides[0].offsetWidth + parseFloat(getComputedStyle(track).columnGap || 0);

  const move = () => {
    track.style.transform = `translateX(${-index * step()}px)`;
  };

  document.querySelector(".hero__next").addEventListener("click", () => {
    index = (index + 1) % slides.length;
    move();
  });

  window.addEventListener("resize", move);
}

/* Меню под бургером. На планшете и десктопе панель не используется:
   там навигация — обычная строка, и кнопка скрыта стилями. */
const burger = document.querySelector(".burger");
const nav = document.querySelector(".nav");

const setMenu = (open) => {
  burger.setAttribute("aria-expanded", String(open));
  burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  nav.dataset.open = String(open);
};

const isMenuOpen = () => burger.getAttribute("aria-expanded") === "true";

burger.addEventListener("click", () => setMenu(!isMenuOpen()));

/* Уводим по ссылке, по Esc и по клику мимо шапки. */
nav.addEventListener("click", (e) => {
  if (e.target.closest("a")) setMenu(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isMenuOpen()) {
    setMenu(false);
    burger.focus();
  }
});

document.addEventListener("click", (e) => {
  if (isMenuOpen() && !e.target.closest(".header")) setMenu(false);
});

/* Кнопка исчезает при переходе на планшет — панель не должна остаться открытой. */
const wide = window.matchMedia("(min-width: 768px)");
wide.addEventListener("change", () => {
  if (wide.matches) setMenu(false);
});

setMenu(false);
