/* Слайдер первого экрана — на Embla Carousel 8.6.0 (assets/vendor).
   Библиотека берёт на себя перетаскивание мышью, свайп на тач-экранах,
   зацикливание и пересчёт размеров при смене ширины окна: у нас слайд
   резиновый, а Embla слушает ResizeObserver и меряет заново сам. */
const heroViewport = document.querySelector(".hero__viewport");
const heroNext = document.querySelector(".hero__next");

if (heroViewport && window.EmblaCarousel) {
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  const plugins = [];

  /* Автопрокрутка не запускается, если человек просил меньше движения.
     stopOnInteraction: false — после свайпа отсчёт начинается заново, а не
     умирает насовсем; под курсором лента ждёт. */
  if (window.EmblaCarouselAutoplay && !calm.matches) {
    plugins.push(
      window.EmblaCarouselAutoplay({
        delay: 5000,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      })
    );
  }

  const hero = window.EmblaCarousel(
    heroViewport,
    { loop: true, align: "start", containScroll: false, duration: 30 },
    plugins
  );

  if (heroNext) heroNext.addEventListener("click", () => hero.scrollNext());

  /* Курсор-ладонь сжимается на время перетаскивания. */
  hero.on("pointerDown", () => {
    heroViewport.dataset.dragging = "true";
  });
  hero.on("pointerUp", () => {
    heroViewport.dataset.dragging = "false";
  });
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
