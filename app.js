(function () {
  const page = window.LAB_MATTAR_PAGE;
  const app = document.getElementById("app");

  const state = {
    activeStageIndex: 0,
    fullscreenStageId: null,
  };

  const refs = {
    stack: null,
    markers: [],
    stages: [],
    overlayRoot: null,
    teardownStack: null,
  };

  function createEl(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  function createText(tag, className, text) {
    const el = createEl(tag, className);
    el.textContent = text;
    return el;
  }

  function getStages() {
    return page.sections.filter((section) => section.type === "stage");
  }

  function getStageById(id) {
    return getStages().find((section) => section.id === id) || null;
  }

  function renderTopbar() {
    const header = createEl("header", "topbar");
    const inner = createEl("div", "topbar__inner");

    const brand = createEl("div", "topbar__brand");
    const eyebrow = createEl("div", "topbar__eyebrow");
    eyebrow.appendChild(createEl("span", "mark"));
    eyebrow.appendChild(createText("span", null, page.eyebrow));
    brand.appendChild(eyebrow);
    brand.appendChild(createText("h1", "topbar__title", page.title));

    const nav = createEl("nav", "topbar__nav");
    page.nav.forEach((item) => {
      const link = createText("a", "nav-link", item.label);
      link.href = `#${item.id}`;
      nav.appendChild(link);
    });

    inner.appendChild(brand);
    inner.appendChild(nav);
    header.appendChild(inner);
    return header;
  }

  function renderHero(section) {
    const wrap = createEl("section", "section section--hero");
    wrap.id = section.id;

    const grid = createEl("div", "hero");
    const copy = createEl("div", "hero__copy");
    copy.appendChild(createText("p", "eyebrow", section.eyebrow));
    copy.appendChild(createText("h2", "hero__title", section.title));
    copy.appendChild(createText("p", "hero__text", section.text));
    grid.appendChild(copy);

    const aside = createEl("div", "hero__aside");
    const list = createEl("ul", "hero__list");
    section.bullets.forEach((item) => {
      const li = createEl("li", "hero__item");
      li.textContent = item;
      list.appendChild(li);
    });
    aside.appendChild(list);
    grid.appendChild(aside);

    wrap.appendChild(grid);
    return wrap;
  }

  function renderStage(section, options) {
    const settings = options || {};
    const wrap = createEl("article", settings.fullscreen ? "stage stage--fullscreen" : "stage");
    wrap.dataset.stageId = section.id;

    const layout = section.layout || "text";
    const cardClass = settings.fullscreen
      ? `stage__card stage__card--fullscreen stage__card--${layout}`
      : `stage__card stage__card--${layout}`;
    const card = createEl("div", cardClass);
    const top = createEl("div", "stage__top");
    top.appendChild(createText("div", "stage__number", section.number));

    const head = createEl("div", "stage__head");
    head.appendChild(createText("h2", "stage__title", section.title));
    head.appendChild(createText("p", "stage__summary", section.summary));
    top.appendChild(head);

    const controls = createEl("div", "stage__controls");
    if (settings.fullscreen) {
      const back = createText("button", "stage__button stage__button--back", "Voltar");
      back.type = "button";
      back.addEventListener("click", closeFullscreen);
      controls.appendChild(back);
    } else {
      const expand = createText("button", "stage__button", "Expandir");
      expand.type = "button";
      expand.dataset.stageExpand = section.id;
      controls.appendChild(expand);
    }
    top.appendChild(controls);

    const points = createEl("ul", "stage__points");
    if (section.points && section.points.length) {
      section.points.forEach((item) => {
        const li = createEl("li", "stage__point");
        li.textContent = item;
        points.appendChild(li);
      });
    }

    const body = createEl("div", `stage__body stage__body--${layout}`);

    if (section.paragraphs && section.paragraphs.length) {
      const prose = createEl("div", "stage__prose");
      section.paragraphs.forEach((paragraph) => {
        prose.appendChild(createText("p", "stage__paragraph", paragraph));
      });
      body.appendChild(prose);
    }

    if (section.blocks && section.blocks.length) {
      const blocks = createEl("div", "stage__blocks");
      section.blocks.forEach((block) => {
        const item = createEl("section", "stage__block");
        if (block.label) item.appendChild(createText("span", "stage__block-label", block.label));
        if (block.title) item.appendChild(createText("h3", "stage__block-title", block.title));
        if (block.text) item.appendChild(createText("p", "stage__block-text", block.text));
        if (block.items && block.items.length) {
          const list = createEl("ul", "stage__inline-list");
          block.items.forEach((entry) => {
            const li = createEl("li", "stage__inline-item");
            li.textContent = entry;
            list.appendChild(li);
          });
          item.appendChild(list);
        }
        blocks.appendChild(item);
      });
      body.appendChild(blocks);
    }

    if (section.media) {
      const media = createEl("div", `stage__media stage__media--${section.media.type || "image"}`);
      if (section.media.label) media.appendChild(createText("span", "stage__media-label", section.media.label));
      if (section.media.title) media.appendChild(createText("h3", "stage__media-title", section.media.title));
      if (section.media.caption) media.appendChild(createText("p", "stage__media-caption", section.media.caption));
      if (section.media.items && section.media.items.length) {
        const mediaGrid = createEl("div", "stage__media-grid");
        section.media.items.forEach((item) => {
          const tile = createEl("div", "stage__media-tile");
          tile.appendChild(createText("span", "stage__media-tile-text", item));
          mediaGrid.appendChild(tile);
        });
        media.appendChild(mediaGrid);
      }
      body.appendChild(media);
    }

    const outcome = createEl("div", "stage__outcome");
    if (section.outcome) {
      outcome.appendChild(createText("span", "stage__outcome-label", "Resultado"));
      outcome.appendChild(createText("p", "stage__outcome-text", section.outcome));
    }

    card.appendChild(top);
    if (points.childNodes.length) card.appendChild(points);
    if (body.childNodes.length) card.appendChild(body);
    if (section.outcome) card.appendChild(outcome);
    wrap.appendChild(card);
    return wrap;
  }

  function renderStageStack(sections) {
    const wrap = createEl("section", "section section--stack");
    wrap.id = "stages";

    const stack = createEl("div", "stage-stack");
    const viewport = createEl("div", "stage-stack__viewport");
    const layers = createEl("div", "stage-stack__layers");
    const markers = createEl("div", "stage-stack__markers");

    refs.stack = stack;
    refs.markers = [];
    refs.stages = [];
    stack.style.setProperty("--stage-count", String(sections.length));

    sections.forEach((section, index) => {
      const marker = createEl("div", "stage-stack__marker");
      marker.id = section.id;
      marker.dataset.index = String(index);
      markers.appendChild(marker);
      refs.markers.push(marker);

      const stage = renderStage(section);
      layers.appendChild(stage);
      refs.stages.push(stage);
    });

    viewport.appendChild(layers);
    stack.appendChild(viewport);
    stack.appendChild(markers);
    wrap.appendChild(stack);
    return wrap;
  }

  function setActiveStage(index) {
    const clamped = Math.max(0, Math.min(refs.stages.length - 1, index));
    state.activeStageIndex = clamped;

    refs.stages.forEach((stage, stageIndex) => {
      const isActive = stageIndex === clamped;
      stage.classList.toggle("is-active", isActive);
      stage.classList.toggle("is-before", stageIndex < clamped);
      stage.classList.toggle("is-after", stageIndex > clamped);

      stage.querySelectorAll("[data-stage-expand]").forEach((button) => {
        button.disabled = !isActive;
      });
    });
  }

  function setupStageStack() {
    if (!refs.stack || !refs.stages.length) return;

    let ticking = false;

    function update() {
      const rect = refs.stack.getBoundingClientRect();
      const viewport = window.innerHeight;
      const total = refs.stages.length;
      const usableHeight = Math.max(1, rect.height - viewport);
      const progressRaw = ((viewport * 0.18) - rect.top) / usableHeight;
      const progress = Math.max(0, Math.min(0.9999, progressRaw));
      const nextIndex = Math.min(total - 1, Math.floor(progress * total));
      setActiveStage(nextIndex);
      ticking = false;
    }

    function requestUpdate() {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }

    refs.stack.addEventListener("click", onStackClick);
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    requestUpdate();

    refs.teardownStack = function () {
      refs.stack.removeEventListener("click", onStackClick);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }

  function onStackClick(event) {
    const button = event.target.closest("[data-stage-expand]");
    if (!button || button.disabled) return;
    openFullscreen(button.dataset.stageExpand);
  }

  function renderFullscreenOverlay(stage) {
    const overlay = createEl("div", "stage-fullscreen");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.appendChild(renderStage(stage, { fullscreen: true }));
    return overlay;
  }

  function openFullscreen(stageId) {
    state.fullscreenStageId = stageId;
    document.body.style.overflow = "hidden";
    updateFullscreen();
  }

  function closeFullscreen() {
    state.fullscreenStageId = null;
    document.body.style.overflow = "";
    updateFullscreen();
  }

  function updateFullscreen() {
    if (!refs.overlayRoot) return;
    refs.overlayRoot.innerHTML = "";

    if (!state.fullscreenStageId) return;
    const stage = getStageById(state.fullscreenStageId);
    if (!stage) return;

    refs.overlayRoot.appendChild(renderFullscreenOverlay(stage));
  }

  function renderPage() {
    document.title = `${page.title} - Planejamento`;

    if (refs.teardownStack) {
      refs.teardownStack();
      refs.teardownStack = null;
    }

    document.body.style.overflow = state.fullscreenStageId ? "hidden" : "";
    refs.stack = null;
    refs.markers = [];
    refs.stages = [];
    app.innerHTML = "";

    const frame = createEl("main", "page");
    frame.appendChild(renderTopbar());

    const content = createEl("div", "page__content");
    const hero = page.sections.find((section) => section.type === "hero");
    const stages = getStages();

    if (hero) content.appendChild(renderHero(hero));
    if (stages.length) content.appendChild(renderStageStack(stages));

    frame.appendChild(content);
    app.appendChild(frame);

    refs.overlayRoot = createEl("div", "overlay-root");
    app.appendChild(refs.overlayRoot);

    setupStageStack();
    updateFullscreen();
  }

  renderPage();
})();
