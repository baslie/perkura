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

/* Секция Works — карусель проектов. Названия едут вдоль дуги, точка на орбите
   стоит на месте и всегда указывает на выбранный проект, слева меняется снимок.

   Листание берёт на себя Embla: перетаскивание, свайп, инерция, доводка до
   ближайшего названия и пересчёт при смене размеров окна. Своё здесь три вещи —
   дуга, колесо мыши и смена снимка.

   Дуга сделана свойством рамки, а не слайда: сдвиг названия вправо зависит от
   того, на какой высоте оно сейчас находится, а не от его номера. Поэтому при
   листании названия скользят по дуге, а сама дуга остаётся неподвижной. */
const works = document.querySelector(".works");

if (works && window.EmblaCarousel) {
  const viewport = works.querySelector(".works__viewport");
  const list = works.querySelector(".works__list");
  const items = [...works.querySelectorAll(".works__item")];
  const inners = items.map((item) => item.querySelector(".works__item-inner"));
  const photo = works.querySelector(".works__photo");
  const navPrev = works.querySelector(".works__nav--prev");
  const navNext = works.querySelector(".works__nav--next");

  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  const desktop = window.matchMedia("(min-width: 1200px)");

  /* Пятое название в макете стоит напротив точки — с него секция и
     открывается; его снимок лежит в разметке. */
  let current = 4;

  /* Дуга из макета: сдвиг вправо у названий с шагом 83 по высоте.
     BOX — высота рамки, FIRST — центр первого названия от её верха. */
  const OFFSETS = [0, 60, 90, 120, 159, 129, 99, 69, 9];
  const STEP = 83;
  const BOX = 732;
  const FIRST = 34;

  /* За крайними узлами дуга продолжается прямой — названия уезжают за край
     рамки, не изламываясь на последнем узле. */
  const node = (i) => {
    const last = OFFSETS.length - 1;
    if (i < 0) return OFFSETS[0] + (OFFSETS[0] - OFFSETS[1]) * -i;
    if (i > last) return OFFSETS[last] + (OFFSETS[last] - OFFSETS[last - 1]) * (i - last);
    return OFFSETS[i];
  };

  /* Между узлами — сплайн Catmull-Rom, а не прямая: наклон дуги на соседних
     отрезках разный (60 против 30 на шаг), и по ломаной названия дёргались бы
     на каждом узле. В самих узлах сплайн даёт ровно координату макета. */
  const arc = (y) => {
    const pos = (y - FIRST) / STEP;
    const i = Math.floor(pos);
    const t = pos - i;
    const [p0, p1, p2, p3] = [node(i - 1), node(i), node(i + 1), node(i + 2)];

    return (
      0.5 *
      (2 * p1 +
        (p2 - p0) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
        (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)
    );
  };

  /* Сначала считываются все позиции, потом пишутся все сдвиги: чередовать
     чтение с записью нельзя — браузер пересчитывал бы разметку на каждом шаге.
     Единица макета берётся из самой рамки: её высота — те самые 732. */
  const drawArc = () => {
    if (!desktop.matches) return;

    const box = viewport.getBoundingClientRect();
    const unit = box.height / BOX;
    const centers = items.map((item) => {
      const rect = item.getBoundingClientRect();
      return (rect.top + rect.height / 2 - box.top) / unit;
    });

    centers.forEach((center, i) => {
      inners[i].style.transform = `translate3d(${(arc(center) * unit).toFixed(2)}px, 0, 0)`;
    });
  };

  /* Снимки меняются через два слоя: в нижний кладётся новый кадр, и когда
     он готов, слои меняются прозрачностью. Так смена идёт без белой вспышки. */
  let front = photo.querySelector(".works__shot");
  let spare = front.cloneNode(false);
  spare.classList.remove("is-active");
  spare.removeAttribute("src");
  front.after(spare);

  const showShot = (src) => {
    if (front.getAttribute("src") === src) return;

    spare.src = src;
    const swap = () => {
      if (spare.getAttribute("src") !== src) return;
      spare.classList.add("is-active");
      front.classList.remove("is-active");
      [front, spare] = [spare, front];
    };

    spare.decode().then(swap, swap);
  };

  /* Соседние кадры подгружаются заранее — иначе следующий снимок появляется
     с задержкой. Разом все девять не тянем: это три мегабайта. */
  const preload = (index) => {
    [index - 1, index + 1].forEach((i) => {
      const item = items[(i + items.length) % items.length];
      if (item) new Image().src = item.dataset.shot;
    });
  };

  const select = (index) => {
    current = index;
    items.forEach((item, i) => item.classList.toggle("is-active", i === index));
    showShot(items[index].dataset.shot);
    preload(index);
  };

  /* На десктопе лента вертикальная и конечная: дойдя до крайнего проекта, она
     упирается — и колесо мыши отдаёт прокрутку странице. На узком экране лента
     горизонтальная и зациклена, упираться ей незачем. */
  const options = () => ({
    axis: desktop.matches ? "y" : "x",
    align: "center",
    containScroll: false,
    loop: !desktop.matches,
    startIndex: current,
    duration: calm.matches ? 0 : 30,
  });

  let embla = null;

  /* Стрелки нарисованы на дуге и поворачиваются вместе с ней: на десктопе
     верхняя отматывает назад, а на узком экране та же стрелка оказывается
     справа — и должна вести вперёд. */
  const roles = () => {
    const backward = desktop.matches ? navPrev : navNext;
    const forward = desktop.matches ? navNext : navPrev;
    backward.setAttribute("aria-label", "Предыдущий проект");
    forward.setAttribute("aria-label", "Следующий проект");
    return { backward, forward };
  };

  const step = (arrow) => {
    if (arrow === roles().forward) embla.scrollNext();
    else embla.scrollPrev();
  };

  [navPrev, navNext].forEach((arrow) => {
    arrow.addEventListener("click", () => step(arrow));
    arrow.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      step(arrow);
    });
  });

  /* Клик по названию выбирает проект. Ловим на всей строке, чтобы попадать и
     мимо букв, но окончание перетаскивания кликом не считаем: смотрим, сколько
     указатель прошёл от нажатия до отпускания. Нажатия без указателя — Enter
     на названии — проходят как обычный выбор. */
  let pressed = null;

  list.addEventListener("pointerdown", (e) => {
    pressed = { x: e.clientX, y: e.clientY };
  });

  list.addEventListener("click", (e) => {
    const item = e.target.closest(".works__item");
    const shift = pressed ? Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) : 0;
    pressed = null;
    if (!item || shift > 6) return;
    embla.scrollTo(items.indexOf(item));
  });

  /* Стрелки клавиатуры работают, когда фокус внутри секции: на десктопе
     вертикальные, на узком экране горизонтальные — по направлению ленты. */
  works.addEventListener("keydown", (e) => {
    const pair = desktop.matches ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
    const at = pair.indexOf(e.key);
    if (at === -1) return;
    e.preventDefault();
    if (at === 0) embla.scrollPrev();
    else embla.scrollNext();
  });

  /* Колесо мыши крутит названия, пока курсор над рамкой и ленте есть куда
     ехать. На крайнем проекте событие не перехватывается — страница
     прокручивается дальше, и блок не залипает под курсором. Мелкие шаги
     трекпада копятся до порога, чтобы одно движение пальцем не пролистывало
     половину списка. */
  let wheel = 0;
  let waitUntil = 0;

  viewport.addEventListener(
    "wheel",
    (e) => {
      if (!desktop.matches) return;

      const forward = e.deltaY > 0;
      if (!(forward ? embla.canScrollNext() : embla.canScrollPrev())) {
        wheel = 0;
        return;
      }

      e.preventDefault();
      if (e.timeStamp < waitUntil) return;

      wheel += e.deltaY;
      if (Math.abs(wheel) < 45) return;

      wheel = 0;
      waitUntil = e.timeStamp + 220;
      if (forward) embla.scrollNext();
      else embla.scrollPrev();
    },
    { passive: false }
  );

  /* Смена режима — не подгонка стилей, а другая карусель: ось, зацикливание
     и раскладка меняются целиком. Выбранный проект при этом остаётся. */
  const build = () => {
    if (embla) {
      current = embla.selectedScrollSnap();
      embla.destroy();
    }

    if (!desktop.matches) inners.forEach((inner) => (inner.style.transform = ""));

    embla = window.EmblaCarousel(viewport, options());
    embla.on("select", () => select(embla.selectedScrollSnap()));
    embla.on("scroll", drawArc);
    embla.on("reInit", drawArc);
    embla.on("pointerDown", () => (viewport.dataset.dragging = "true"));
    embla.on("pointerUp", () => (viewport.dataset.dragging = "false"));

    roles();
    drawArc();
    select(embla.selectedScrollSnap());

    /* Метка для стилей: карусель жива. До неё секция остаётся статичной
       витриной — без приглушения, обрезки по краям и курсора-ладони. */
    works.dataset.ready = "true";
  };

  desktop.addEventListener("change", build);
  build();
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
