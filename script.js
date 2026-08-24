/* Скрипт один на все страницы, поэтому каждая часть сначала убеждается, что
   её разметка на месте, и молча уходит, если нет. Частей пять: слайдер первого
   экрана, лента проектов, карусель проектов в Works, меню под бургером и
   появление блоков при прокрутке. Всё лежит внутри одной функции, чтобы не
   заводить глобальных имён. */
(() => {
  /* Просьбу «поменьше движения» уважают оба слайдера, поэтому запрос один. */
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Слайдер первого экрана — на Embla Carousel 8.6.0 (assets/vendor).
     Библиотека берёт на себя перетаскивание мышью, свайп на тач-экранах,
     зацикливание и пересчёт размеров при смене ширины окна: у нас слайд
     резиновый, а Embla слушает ResizeObserver и меряет заново сам. */
  const initHero = () => {
    const heroViewport = document.querySelector(".hero__viewport");
    const heroNext = document.querySelector(".hero__next");
    if (!heroViewport || !window.EmblaCarousel) return;

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
  };

  /* Лента проектов — «авторский надзор» на услугах и «другие проекты» на
     странице проекта. Разметка и стили у них общие, поведение тоже.

     Веер из пяти кадров выложен в стилях обычной flex-строкой, и середина
     строки совпадает с серединой среднего кадра. Поэтому выравнивания по
     центру и третьего слайда стартовым хватает, чтобы в покое лента встала
     ровно как в макете, — подгонять ничего не нужно.

     Лента зациклена: у неё нет краёв, за которыми появлялась бы пустота.
     Оговорка из Works — «на десктопе не зацикливаем, иначе колесо залипает» —
     сюда не относится: колесо здесь не перехватывается. */
  /* Узлы раскладки — три места кадра: в центре, соседом, с краю. Все числа
     из макета: масштаб — отношение ширин 580 / 384 / 326, спуск — бывшие
     координаты top, поправка вбок — разница между равномерным шагом слотов
     и настоящим расстоянием до крайнего кадра (1024 против 897). Кегль и поле
     подписи убывают отдельно: 22 / 20 / 18 и 30 / 30 / 27. */
  const SHAPE = {
    s: [1, 0.662069, 0.562069],
    dy: [0, 115, 149],
    dx: [0, 0, 127],
    cap: [22, 20, 18],
    pad: [30, 30, 27],
  };

  /* Между узлами — сглаживание с нулевой производной на концах: по ломаной
     кадры дёргались бы, проходя узел. За последним узлом значение замирает —
     дальше двух слотов от середины кадр всё равно за обрезом рамки. */
  const step = (nodes, away) => {
    const from = Math.min(Math.floor(away), nodes.length - 1);
    const to = Math.min(from + 1, nodes.length - 1);
    const t = Math.min(Math.max(away - from, 0), 1);
    return nodes[from] + (nodes[to] - nodes[from]) * (t * t * (3 - 2 * t));
  };

  const initReel = () => {
    const reel = document.querySelector(".reel");
    if (!reel || !window.EmblaCarousel) return;

    const viewport = reel.querySelector(".reel__viewport");
    const slots = [...reel.querySelectorAll(".reel__slot")];
    const cards = slots.map((slot) => slot.querySelector(".reel__card"));
    if (!viewport || !slots.length) return;

    /* Точки лежат по-разному: на услугах внутри ленты, на странице проекта
       соседом. Координаты у них считаются от разных предков, переносить нельзя —
       поэтому ищем по секции целиком. */
    const dots = [...reel.closest("section").querySelectorAll(".reel__dots .dot")];

    /* Метку ставим до сборки, а не после. Она снимает статическое центрирование
       строки, а Embla при инициализации меряет, где слайды лежат сейчас: успей
       центрирование дожить до замера — библиотека посчитала бы смещения от него
       и после снятия вся лента уехала бы вправо на полразницы ширин. Заодно
       метка включает курсор-ладонь. */
    reel.dataset.ready = "true";

    const embla = window.EmblaCarousel(viewport, {
      loop: true,
      align: "center",
      containScroll: false,
      startIndex: 2,
      duration: calm.matches ? 0 : 30,
    });

    /* Раскладка. Сначала читаем положение всех слотов, потом пишем всем кадрам —
       вперемешку браузер пересчитывал бы разметку на каждом слоте, как и
       в drawArc у карусели Works.

       d — насколько слот отошёл от середины рамки, в слотах. Ноль — кадр
       в центре, единица — сосед, двойка — край. Знак нужен только поправке
       вбок: она тянет крайние кадры внутрь, к середине. */
    const shape = () => {
      const frame = viewport.getBoundingClientRect();
      const middle = frame.left + frame.width / 2;
      const boxes = slots.map((slot) => slot.getBoundingClientRect());

      boxes.forEach((box, i) => {
        const d = ((box.left + box.right) / 2 - middle) / box.width;
        const away = Math.abs(d);
        const card = cards[i];
        if (!card) return;

        card.style.setProperty("--s", step(SHAPE.s, away).toFixed(4));
        card.style.setProperty("--dy", step(SHAPE.dy, away).toFixed(2));
        card.style.setProperty("--dx", (-Math.sign(d) * step(SHAPE.dx, away)).toFixed(2));
        card.style.setProperty("--cap", step(SHAPE.cap, away).toFixed(2));
        card.style.setProperty("--pad", step(SHAPE.pad, away).toFixed(2));
      });
    };

    /* Круг стоит неподвижно, но ведёт он на тот проект, что сейчас в центре:
       адрес лежит на самом кадре, в data-href. Сейчас у всех пяти он один —
       других страниц проектов в макете нет, — и когда они появятся, править
       придётся только разметку. */
    const cta = reel.querySelector(".reel__cta");

    const select = () => {
      const index = embla.selectedScrollSnap();
      dots.forEach((dot, i) => {
        dot.classList.toggle("dot--active", i === index);
        dot.setAttribute("aria-selected", String(i === index));
      });

      /* Метка на слоте нужна одним стилям — курсору. Боковой кадр щелчком
         уезжает в середину, центральный уже там, и ладонь на нём честнее
         указателя. Так же помечен выбранный проект в Works. */
      slots.forEach((slot, i) => slot.classList.toggle("is-active", i === index));

      const href = cards[index] && cards[index].dataset.href;
      if (cta && href) cta.setAttribute("href", href);
    };

    dots.forEach((dot, i) => dot.addEventListener("click", () => embla.scrollTo(i)));

    /* Щелчок по боковому кадру двигает его в середину — третий способ листать
       вдобавок к перетаскиванию и точкам. Слушаем рамку целиком, а не каждый
       кадр: обработчик один, и он переживёт любую перетасовку слотов, которую
       затевает зацикливание.

       Окончание перетаскивания щелчком не считаем: смотрим, сколько указатель
       прошёл от нажатия до отпускания, — тот же приём, что у названий в Works.
       Embla глушит щелчок сама, но только после 10 пикселей хода; дрожь пальца
       на тач-экране в этот порог укладывается, и без своей проверки кадр уезжал
       бы от неудавшегося свайпа.

       Центральный кадр из этого выпадает: ехать ему некуда, а вход в проект —
       круг «see the project», который лежит поверх. Клавиатуре свой обработчик
       не нужен: тот же выбор делают точки, а они настоящие кнопки. */
    let pressed = null;

    viewport.addEventListener("pointerdown", (e) => {
      pressed = { x: e.clientX, y: e.clientY };
    });

    viewport.addEventListener("click", (e) => {
      const card = e.target.closest(".reel__card");
      const shift = pressed ? Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) : 0;
      pressed = null;

      const index = card ? cards.indexOf(card) : -1;
      if (index === -1 || shift > 6 || index === embla.selectedScrollSnap()) return;
      embla.scrollTo(index);
    });

    embla.on("select", select);
    embla.on("scroll", shape);
    embla.on("reInit", shape);
    /* Последний scroll приходит на кадр раньше, чем лента встаёт окончательно,
       и без этой строки центральный снимок замирал на десяток пикселей правее
       середины — доводку видно по кругу, который стоит неподвижно. */
    embla.on("settle", shape);
    embla.on("pointerDown", () => {
      viewport.dataset.dragging = "true";
    });
    embla.on("pointerUp", () => {
      viewport.dataset.dragging = "false";
    });

    shape();
    select();
  };

  /* Секция Works — карусель проектов. Названия едут вдоль дуги, точка на орбите
     стоит на месте и всегда указывает на выбранный проект, слева меняется снимок.

     Листание берёт на себя Embla: перетаскивание, свайп, инерция, доводка до
     ближайшего названия и пересчёт при смене размеров окна. Своё здесь три вещи —
     дуга, колесо мыши и смена снимка.

     Дуга сделана свойством рамки, а не слайда: сдвиг названия вправо зависит от
     того, на какой высоте оно сейчас находится, а не от его номера. Поэтому при
     листании названия скользят по дуге, а сама дуга остаётся неподвижной. */
  const initWorks = () => {
    const works = document.querySelector(".works");
    if (!works || !window.EmblaCarousel) return;

    const viewport = works.querySelector(".works__viewport");
    const list = works.querySelector(".works__list");
    const items = [...works.querySelectorAll(".works__item")];
    const inners = items.map((item) => item.querySelector(".works__item-inner"));
    const photo = works.querySelector(".works__photo");
    const navPrev = works.querySelector(".works__nav--prev");
    const navNext = works.querySelector(".works__nav--next");

    const desktop = window.matchMedia("(min-width: 1200px)");

    /* Пятое название в макете стоит напротив точки — с него секция и
       открывается; его снимок лежит в разметке. */
    let current = 4;

    /* Дуга из макета: сдвиг вправо у названий с шагом 83 по высоте.
       BOX — высота рамки, FIRST — центр первого названия от её верха.

       Эти же числа лежат в styles.css: OFFSETS — в правилах
       .works__item:nth-child(1..9), STEP — высота .works__item, BOX — высота
       .works__viewport. Дублирование намеренное: CSS держит статичную витрину
       для случая, когда скрипт не отработал, а скрипт двигает дугу живьём.
       Меняете здесь — меняйте и там, иначе витрина разъедется с каруселью. */
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

    const showShot = (src, alt) => {
      if (front.getAttribute("src") === src) return;

      spare.src = src;
      spare.alt = alt;
      const swap = () => {
        if (spare.getAttribute("src") !== src) return;
        spare.classList.add("is-active");
        front.classList.remove("is-active");
        [front, spare] = [spare, front];
      };

      spare.decode().then(swap, swap);
    };

    /* Подпись снимка собирается из самой карточки: название проекта и строка
       под ним. Иначе кадр меняется, а альтернативный текст остаётся от
       предыдущего — для читающего с экрана снимок так и не меняется. */
    const shotAlt = (item) => {
      const name = item.querySelector(".works__pick");
      const meta = item.querySelector(".works__meta");
      if (!name) return "";
      return meta ? name.textContent + " — " + meta.textContent : name.textContent;
    };

    /* Соседние кадры подгружаются заранее — иначе следующий снимок появляется
       с задержкой. Разом все девять не тянем: это три мегабайта. */
    const preload = (index) => {
      [index - 1, index + 1].forEach((i) => {
        const item = items[(i + items.length) % items.length];
        new Image().src = item.dataset.shot;
      });
    };

    const select = (index) => {
      current = index;
      items.forEach((item, i) => item.classList.toggle("is-active", i === index));
      showShot(items[index].dataset.shot, shotAlt(items[index]));
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
  };

  /* Меню под бургером. С 900 и выше панель не используется: там навигация —
     обычная строка, и кнопка скрыта стилями. */
  const initMenu = () => {
    const burger = document.querySelector(".burger");
    const nav = document.querySelector(".nav");
    /* Шапка есть на каждой странице сайта, но проверка нужна: без неё
       скрипт упадёт на первой же странице, где меню не понадобится. */
    if (!burger || !nav) return;

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

    /* Кнопка исчезает на 900 — панель не должна остаться открытой. Порог тот же,
       что у строчного меню в стилях: ниже него семь пунктов в строку не влезают. */
    const wide = window.matchMedia("(min-width: 900px)");
    wide.addEventListener("change", () => {
      if (wide.matches) setMenu(false);
    });

    setMenu(false);
  };

  /* Появление блоков при прокрутке. Начальное — спрятанное — состояние
     навешивает скрипт, а не разметка: в HTML стоит класс reveal, который сам
     по себе ничего не значит, и только здесь элемент получает data-reveal.
     Из этого следуют два свойства, ради которых всё и сделано так.

     Первое: то, что видно при загрузке, не анимируется вовсе. Правило
     «первый экран без движения» держится этой проверкой, а не памятью
     верстальщика — элемент выше нижнего края окна просто не получает
     начального состояния, и неважно, 1920 сейчас или 390.

     Второе: без скрипта страница видна целиком. Прячет только состояние
     pending, а поставить его больше некому. Тот же приём, что у data-ready
     в Works. */
  const initReveal = () => {
    const items = document.querySelectorAll(".reveal");
    if (!items.length || calm.matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.dataset.reveal = "shown";
          io.unobserve(entry.target);
        });
      },
      /* Нижний край кадра поднят: у самой кромки окна раскрытие не читается,
         блок должен войти в кадр по-настоящему. Но и не слишком высоко —
         раскрытие идёт около секунды, и начаться оно должно раньше, чем
         блок встанет по центру, иначе дочитывается уже вдогонку. */
      { rootMargin: "0px 0px -8% 0px" },
    );

    /* Сначала все чтения, потом все записи — как в drawArc. Вперемешку
       браузер пересчитывал бы разметку на каждом элементе списка. */
    const tops = [...items].map((el) => el.getBoundingClientRect().top);
    const fold = window.innerHeight;

    items.forEach((el, i) => {
      if (tops[i] < fold) return;
      el.dataset.reveal = "pending";
      io.observe(el);
    });

    /* Хвост страницы короче поднятой кромки: линейка футера лежит в тех самых
       последних процентах окна, до которых наблюдателю уже не дотянуться, —
       прокручивать дальше некуда. Дочитав до низа, показываем остаток сами. */
    const flushTail = () => {
      const doc = document.documentElement;
      if (window.innerHeight + Math.ceil(window.scrollY) < doc.scrollHeight - 1) return;

      items.forEach((el) => {
        if (el.dataset.reveal !== "pending") return;
        el.dataset.reveal = "shown";
        io.unobserve(el);
      });

      window.removeEventListener("scroll", flushTail);
    };

    window.addEventListener("scroll", flushTail, { passive: true });
    flushTail();
  };

  initHero();
  initReel();
  initWorks();
  initMenu();
  initReveal();
})();
