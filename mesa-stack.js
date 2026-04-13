(function () {
  const acts = window.MESA_ACTS || [];
  const vectorData = window.MESA_VECTOR_DATA;
  if (!acts.length || !vectorData) return;

  const ARTBOARD = vectorData.artboard;
  const BALANCED_PLATE_ORDER = [0, 3, 1, 4, 2, 5];
  const STACK_LAYERS = [
    { key: "base", target: "under", y: 0, scale: 1, opacity: 0.74 },
    { key: "level1", target: "under", y: -10, scale: 0.996, opacity: 0.5 },
    { key: "level2", target: "under", y: -22, scale: 0.992, opacity: 0.42 },
    { key: "level3", target: "under", y: -34, scale: 0.988, opacity: 0.34 },
    { key: "topCrop", target: "under", y: -72, scale: 0.976, opacity: 0.26 },
    { key: "mesas", target: "over", y: -48, scale: 0.985, opacity: 0.3 },
    { key: "plates", target: "over", y: -58, scale: 0.982, opacity: 0.56 },
  ];

  const refs = {
    actList: document.getElementById("act-list"),
    occupancy: document.getElementById("occupancy"),
    occupancyValue: document.getElementById("occupancy-value"),
    stability: document.getElementById("stability"),
    stabilityValue: document.getElementById("stability-value"),
    exchange: document.getElementById("exchange"),
    exchangeValue: document.getElementById("exchange-value"),
    density: document.getElementById("density"),
    densityValue: document.getElementById("density-value"),
    tempo: document.getElementById("tempo"),
    tempoValue: document.getElementById("tempo-value"),
    showVectors: document.getElementById("show-vectors"),
    resetScene: document.getElementById("reset-scene"),
    application: document.getElementById("act-application"),
    palette: document.getElementById("palette"),
    hudName: document.getElementById("hud-name"),
    hudStatement: document.getElementById("hud-statement"),
    hudMesas: document.getElementById("hud-mesas"),
    hudPratos: document.getElementById("hud-pratos"),
    hudWalkers: document.getElementById("hud-walkers"),
    hudNodes: document.getElementById("hud-nodes"),
    hudRegime: document.getElementById("hud-regime"),
    factLevels: document.getElementById("fact-levels"),
    canvas: document.getElementById("scene"),
    artboard: document.getElementById("artboard"),
    stackUnder: document.getElementById("vector-stack-under"),
    stackOver: document.getElementById("vector-stack-over"),
  };

  const ctx = refs.canvas.getContext("2d");
  const state = {
    activeId: acts[0].id,
    occupancy: Number(refs.occupancy.value),
    stability: Number(refs.stability.value),
    exchange: Number(refs.exchange.value),
    density: Number(refs.density.value),
    tempo: Number(refs.tempo.value),
    showVectors: refs.showVectors.checked,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    phase: 0,
    lastTs: 0,
    masks: {},
    sim: null,
  };

  init();

  function init() {
    refs.factLevels.textContent = "4";
    buildMasks();
    renderActButtons();
    bindControls();
    handleResize();
    rebuildSimulation();
    window.addEventListener("resize", handleResize);
    window.requestAnimationFrame(frame);
  }

  function bindControls() {
    bindSlider(refs.occupancy, refs.occupancyValue, "occupancy");
    bindSlider(refs.stability, refs.stabilityValue, "stability");
    bindSlider(refs.exchange, refs.exchangeValue, "exchange");
    bindSlider(refs.density, refs.densityValue, "density");
    bindSlider(refs.tempo, refs.tempoValue, "tempo");

    refs.showVectors.addEventListener("change", function () {
      state.showVectors = refs.showVectors.checked;
      updateStackVisibility();
    });

    refs.resetScene.addEventListener("click", function () {
      rebuildSimulation();
    });
  }

  function bindSlider(input, output, key) {
    input.addEventListener("input", function () {
      state[key] = Number(input.value);
      output.textContent = String(state[key]);
      rebuildSimulation();
    });
  }

  function renderActButtons() {
    refs.actList.innerHTML = "";
    acts.forEach(function (act) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "act-chip";
      button.dataset.actId = act.id;
      button.innerHTML =
        '<span class="act-chip__name">' +
        act.name +
        '</span><span class="act-chip__note">' +
        act.eyebrow +
        "</span>";
      button.addEventListener("click", function () {
        state.activeId = act.id;
        rebuildSimulation();
      });
      refs.actList.appendChild(button);
    });
    syncActButtons();
  }

  function syncActButtons() {
    refs.actList.querySelectorAll(".act-chip").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.actId === state.activeId);
    });
  }

  function buildMasks() {
    ["base", "level1", "level2", "level3", "topCrop"].forEach(function (key) {
      const canvas = document.createElement("canvas");
      canvas.width = ARTBOARD.width;
      canvas.height = ARTBOARD.height;
      const maskCtx = canvas.getContext("2d");
      const asset = vectorData.assets[key];
      const transform = getFitTransform(asset);

      maskCtx.clearRect(0, 0, ARTBOARD.width, ARTBOARD.height);
      maskCtx.fillStyle = "#ffffff";
      maskCtx.save();
      maskCtx.translate(transform.x, transform.y);
      maskCtx.scale(transform.scale, transform.scale);
      asset.paths.forEach(function (path) {
        maskCtx.fill(new Path2D(path.d));
      });
      maskCtx.restore();

      state.masks[key] = maskCtx.getImageData(0, 0, ARTBOARD.width, ARTBOARD.height).data;
    });
  }

  function handleResize() {
    const rect = refs.artboard.getBoundingClientRect();
    refs.canvas.width = Math.max(1, Math.round(rect.width * state.dpr));
    refs.canvas.height = Math.max(1, Math.round(rect.height * state.dpr));
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function rebuildSimulation() {
    const act = getAct();
    const occupancyNorm = state.occupancy / 6;
    const stabilityNorm = state.stability / 100;
    const exchangeNorm = state.exchange / 100;
    const densityNorm = state.density / 100;
    const tempoNorm = state.tempo / 100;
    const mesaSeeds = vectorData.mesaCenters.map(copyPoint);
    const plateSeeds = getActivePlateAnchors();
    const walkerBoost = 0.85 + densityNorm * 2.1;
    const nodeBoost = 1 + densityNorm * 1.6;

    state.sim = {
      act: act,
      settings: {
        substeps: 2 + Math.round(tempoNorm * 5),
        exchangeNorm: exchangeNorm,
        densityNorm: densityNorm,
        prefill: 80 + Math.round(densityNorm * 220) + Math.round(tempoNorm * 140) + state.occupancy * 22,
      },
      activePlates: plateSeeds,
      colonies: [
        createColony({
          key: "base",
          maskKey: "base",
          seeds: mesaSeeds,
          walkers: Math.round((140 + exchangeNorm * 120) * walkerBoost),
          maxNodes: Math.round((220 + occupancyNorm * 120) * nodeBoost),
          stickDistance: 11 + stabilityNorm * 1.4,
          stickChance: 0.11 + stabilityNorm * 0.1,
          stepSize: 2.2 + exchangeNorm * 1.2 + tempoNorm * 0.4,
          turnRate: 0.75 + exchangeNorm * 0.4,
          pull: 0.02,
          bridgeChance: 0.02,
          nodeSize: 2.6,
          spawnRadius: 28,
          walkerSize: 1.85,
          lineAlpha: 0.28,
          bridgeAlpha: 0.24,
          walkerAlpha: 0.44,
          walkerGlowAlpha: 0.22,
        }),
        createColony({
          key: "level1",
          maskKey: "level1",
          seeds: plateSeeds,
          walkers: Math.round((240 + occupancyNorm * 140) * walkerBoost),
          maxNodes: Math.round((520 + stabilityNorm * 260) * nodeBoost),
          stickDistance: 12 + stabilityNorm * 1.8,
          stickChance: 0.18 + stabilityNorm * 0.16,
          stepSize: 2 + exchangeNorm * 0.85 + tempoNorm * 0.45,
          turnRate: 0.6 + exchangeNorm * 0.28,
          pull: 0.055,
          bridgeChance: act.id === "redes" ? 0.12 : 0.035,
          nodeSize: 3.35,
          spawnRadius: 20,
          walkerSize: 1.95,
          lineAlpha: 0.46,
          bridgeAlpha: 0.34,
          walkerAlpha: 0.76,
          walkerGlowAlpha: 0.28,
        }),
        createColony({
          key: "level2",
          maskKey: "level2",
          seeds: plateSeeds.concat(mesaSeeds),
          walkers: Math.round((200 + exchangeNorm * 120) * walkerBoost),
          maxNodes: Math.round((420 + (occupancyNorm + stabilityNorm) * 240) * nodeBoost),
          stickDistance: 12 + stabilityNorm * 1.3,
          stickChance: act.id === "redes" ? 0.28 : 0.16 + stabilityNorm * 0.1,
          stepSize: 2.1 + exchangeNorm * 1 + tempoNorm * 0.5,
          turnRate: 0.9 + exchangeNorm * 0.42,
          pull: 0.04,
          bridgeChance: act.id === "redes" || act.id === "poiesis" ? 0.22 : 0.08,
          nodeSize: 2.95,
          spawnRadius: 24,
          walkerSize: 1.8,
          lineAlpha: 0.4,
          bridgeAlpha: 0.3,
          walkerAlpha: 0.68,
          walkerGlowAlpha: 0.24,
        }),
        createColony({
          key: "level3",
          maskKey: "level3",
          seeds: mesaSeeds,
          walkers: Math.round((180 + exchangeNorm * 140) * walkerBoost),
          maxNodes: Math.round((320 + stabilityNorm * 220) * nodeBoost),
          stickDistance: 11,
          stickChance:
            act.id === "individuo"
              ? 0.32
              : act.id === "enxame"
              ? 0.16
              : 0.2 + stabilityNorm * 0.08,
          stepSize: 2.3 + exchangeNorm * (act.id === "enxame" ? 1.8 : 0.9) + tempoNorm * 0.55,
          turnRate: 1 + exchangeNorm * (act.id === "enxame" ? 0.9 : 0.28),
          pull: act.id === "enxame" ? 0.014 : 0.03,
          bridgeChance: act.id === "poiesis" ? 0.16 : 0.045,
          nodeSize: 2.7,
          spawnRadius: 26,
          walkerSize: 1.7,
          lineAlpha: 0.34,
          bridgeAlpha: 0.26,
          walkerAlpha: 0.58,
          walkerGlowAlpha: 0.22,
        }),
      ],
    };

    applyTheme(act);
    renderStack();
    updateUi();
    prewarmSimulation(state.sim.settings.prefill);
    updateStats();
    renderScene();
  }

  function createColony(options) {
    const seeds = options.seeds.length ? options.seeds : [];
    return {
      key: options.key,
      maskKey: options.maskKey,
      seeds: seeds,
      walkers: seeds.length ? buildWalkers(options.walkers, seeds, options.stepSize, options.spawnRadius) : [],
      nodes: seeds.map(function (seed, index) {
        return {
          x: seed.x,
          y: seed.y,
          parent: null,
          bridge: null,
          generation: 0,
          seedIndex: index,
          size: options.nodeSize * 1.8,
        };
      }),
      maxNodes: options.maxNodes,
      stickDistance: options.stickDistance,
      stickChance: options.stickChance,
      stepSize: options.stepSize,
      turnRate: options.turnRate,
      pull: options.pull,
      bridgeChance: options.bridgeChance,
      nodeSize: options.nodeSize,
      spawnRadius: options.spawnRadius,
      walkerSize: options.walkerSize,
      lineAlpha: options.lineAlpha || 0.3,
      bridgeAlpha: options.bridgeAlpha || 0.2,
      walkerAlpha: options.walkerAlpha || 0.4,
      walkerGlowAlpha: options.walkerGlowAlpha || 0.18,
    };
  }

  function buildWalkers(count, seeds, stepSize, spawnRadius) {
    const walkers = [];
    for (let i = 0; i < count; i += 1) {
      walkers.push(createWalker(seeds, stepSize, spawnRadius));
    }
    return walkers;
  }

  function createWalker(seeds, stepSize, spawnRadius) {
    const seedIndex = Math.floor(Math.random() * Math.max(1, seeds.length));
    const seed = seeds[seedIndex] || { x: ARTBOARD.width * 0.5, y: ARTBOARD.height * 0.5 };
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * spawnRadius;
    return {
      x: seed.x + Math.cos(angle) * radius,
      y: seed.y + Math.sin(angle) * radius,
      angle: Math.random() * Math.PI * 2,
      wobble: Math.random() * Math.PI * 2,
      speed: stepSize * (0.82 + Math.random() * 0.5),
      seedIndex: seedIndex,
    };
  }

  function getActivePlateAnchors() {
    const result = [];
    vectorData.plateGroups.forEach(function (group) {
      const ordered = BALANCED_PLATE_ORDER.map(function (position) {
        return group.plates[position];
      });
      ordered.slice(0, state.occupancy).forEach(function (plateIndex) {
        result.push(copyPoint(vectorData.plateAnchors[plateIndex]));
      });
    });
    return result;
  }

  function prewarmSimulation(iterations) {
    for (let i = 0; i < iterations; i += 1) {
      stepSimulation(1);
    }
  }

  function frame(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(1.6, (ts - state.lastTs) / 16.6667);
    state.lastTs = ts;
    state.phase += dt * 0.018;

    if (state.sim) {
      for (let i = 0; i < state.sim.settings.substeps; i += 1) {
        stepSimulation(dt);
      }
      renderScene();
    }

    window.requestAnimationFrame(frame);
  }

  function stepSimulation(dt) {
    if (!state.sim) return;
    const exchangeNorm = state.sim.settings.exchangeNorm;

    state.sim.colonies.forEach(function (colony) {
      if (!colony.seeds.length) return;

      if (colony.nodes.length > colony.maxNodes) {
        colony.nodes.splice(colony.seeds.length, colony.nodes.length - colony.maxNodes);
      }

      if (colony.nodes.length >= colony.maxNodes && Math.random() < 0.02 + exchangeNorm * 0.06) {
        colony.nodes.splice(colony.seeds.length, Math.min(2, Math.max(0, colony.nodes.length - colony.seeds.length)));
      }

      for (let i = 0; i < colony.walkers.length; i += 1) {
        const walker = colony.walkers[i];
        updateWalker(walker, colony, dt);

        if (!pointInMask(colony.maskKey, walker.x, walker.y)) {
          colony.walkers[i] = createWalker(colony.seeds, colony.stepSize, colony.spawnRadius);
          continue;
        }

        const nearest = findNearest(walker.x, walker.y, colony.nodes, colony.stickDistance, 76);
        if (!nearest) continue;

        if (nearest.distanceSq <= colony.stickDistance * colony.stickDistance && Math.random() < colony.stickChance) {
          const parent = colony.nodes[nearest.index];
          const node = {
            x: walker.x,
            y: walker.y,
            parent: nearest.index,
            bridge: null,
            generation: parent.generation + 1,
            seedIndex: parent.seedIndex,
            size: Math.max(0.72, colony.nodeSize * Math.pow(0.992, parent.generation + 1)),
          };

          if (nearest.altIndex !== null && Math.random() < colony.bridgeChance) {
            node.bridge = nearest.altIndex;
          }

          colony.nodes.push(node);
          colony.walkers[i] = createWalker(colony.seeds, colony.stepSize, colony.spawnRadius);
        }
      }
    });
  }

  function updateWalker(walker, colony, dt) {
    const seed = colony.seeds[walker.seedIndex % colony.seeds.length];
    const toSeed = Math.atan2(seed.y - walker.y, seed.x - walker.x);
    const wander = (Math.random() - 0.5) * colony.turnRate;
    walker.angle += wander + Math.sin(state.phase + walker.wobble) * 0.08;
    walker.angle = mixAngles(walker.angle, toSeed, colony.pull);

    const step = walker.speed * dt;
    const nx = walker.x + Math.cos(walker.angle) * step;
    const ny = walker.y + Math.sin(walker.angle) * step;

    if (pointInMask(colony.maskKey, nx, ny)) {
      walker.x = nx;
      walker.y = ny;
      return;
    }

    walker.angle += Math.PI * (0.28 + Math.random() * 0.6);
    const bounceX = walker.x + Math.cos(walker.angle) * step * 0.7;
    const bounceY = walker.y + Math.sin(walker.angle) * step * 0.7;
    if (pointInMask(colony.maskKey, bounceX, bounceY)) {
      walker.x = bounceX;
      walker.y = bounceY;
      return;
    }

    const seedReset = colony.seeds[walker.seedIndex % colony.seeds.length];
    walker.x = seedReset.x;
    walker.y = seedReset.y;
  }

  function renderScene() {
    const act = state.sim.act;
    const width = refs.artboard.clientWidth;
    const height = refs.artboard.clientHeight;

    ctx.clearRect(0, 0, width, height);
    paintField(width, height, act);

    state.sim.colonies.forEach(function (colony) {
      paintColony(colony, act, width, height);
    });

    paintActivePlates(act, width, height);
    updateStats();
  }

  function paintField(width, height, act) {
    const palette = act.palette;
    vectorData.mesaCenters.forEach(function (mesa, index) {
      const point = scalePoint(mesa, width, height);
      const glowRadius = 78 + Math.sin(state.phase * 2 + index * 0.6) * 12;
      const halo = ctx.createRadialGradient(point.x, point.y, 8, point.x, point.y, glowRadius);
      halo.addColorStop(0, rgba(palette.glow, 0.16));
      halo.addColorStop(0.45, rgba(palette.secondary, 0.08));
      halo.addColorStop(1, rgba(palette.secondary, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(point.x - glowRadius, point.y - glowRadius, glowRadius * 2, glowRadius * 2);
    });
  }

  function paintColony(colony, act, width, height) {
    const colors = getColonyColors(colony.key, act.palette);
    const sceneScale = width / ARTBOARD.width;
    const lineWidth = Math.max(0.9, (colony.key === "level2" ? 1.3 : 1.05) * sceneScale);

    ctx.save();
    ctx.lineWidth = lineWidth;

    for (let i = colony.seeds.length; i < colony.nodes.length; i += 1) {
      const node = colony.nodes[i];
      if (node.parent === null) continue;
      const point = scalePoint(node, width, height);
      const parent = scalePoint(colony.nodes[node.parent], width, height);
      const tone = clamp(node.generation / 24, 0, 1);
      ctx.strokeStyle = rgba(mixColor(colors.lineA, colors.lineB, tone), colony.lineAlpha);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(parent.x, parent.y);
      ctx.stroke();

      if (node.bridge !== null) {
        const bridge = scalePoint(colony.nodes[node.bridge], width, height);
        ctx.strokeStyle = rgba(colors.bridge, colony.bridgeAlpha);
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(bridge.x, bridge.y);
        ctx.stroke();
      }
    }

    colony.walkers.forEach(function (walker) {
      const point = scalePoint(walker, width, height);
      const walkerRadius = Math.max(1.4, colony.walkerSize * sceneScale);
      ctx.fillStyle = rgba(colors.walkerGlow, colony.walkerGlowAlpha);
      ctx.beginPath();
      ctx.arc(point.x, point.y, walkerRadius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = rgba(colors.walker, act.id === "enxame" ? colony.walkerAlpha + 0.08 : colony.walkerAlpha);
      ctx.beginPath();
      ctx.arc(point.x, point.y, walkerRadius, 0, Math.PI * 2);
      ctx.fill();
    });

    colony.nodes.forEach(function (node) {
      const point = scalePoint(node, width, height);
      const size = node.size * (width / ARTBOARD.width);
      drawNode(point, size, colors, act.effect);
    });

    ctx.restore();
  }

  function drawNode(point, size, colors, effect) {
    if (effect === "rgb-delay") {
      [[-2.4, 0.7, "#ff4ca8"], [2.2, -0.8, "#4ce8ff"], [0.7, 1.6, "#7f67ff"]].forEach(function (ghost) {
        ctx.fillStyle = rgba(ghost[2], 0.24);
        ctx.beginPath();
        ctx.arc(point.x + ghost[0], point.y + ghost[1], size * 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.fillStyle = rgba(colors.glow, 0.34);
    ctx.beginPath();
    ctx.arc(point.x, point.y, size * 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.core;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = rgba(colors.edge, 0.72);
    ctx.lineWidth = Math.max(0.8, size * 0.22);
    ctx.stroke();
  }

  function paintActivePlates(act, width, height) {
    ctx.save();
    state.sim.activePlates.forEach(function (plate, index) {
      const point = scalePoint(plate, width, height);
      const pulse = 1 + Math.sin(state.phase * 4 + index) * 0.18;
      ctx.strokeStyle = rgba(act.palette.plate, 0.42);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 8.5 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function updateUi() {
    const act = state.sim.act;
    syncActButtons();
    refs.hudRegime.textContent = act.eyebrow;
    refs.hudName.textContent = act.name;
    refs.hudStatement.textContent = act.statement;
    refs.application.textContent = act.application;

    refs.palette.innerHTML = "";
    [
      ["bg", act.palette.bgStart],
      ["core", act.palette.primary],
      ["accent", act.palette.secondary],
      ["alt", act.palette.tertiary],
      ["glow", act.palette.glow],
    ].forEach(function (entry) {
      const swatch = document.createElement("div");
      swatch.className = "swatch";
      swatch.innerHTML =
        '<div class="swatch__chip" style="background:' +
        entry[1] +
        '"></div><span class="swatch__label">' +
        entry[0] +
        "</span>";
      refs.palette.appendChild(swatch);
    });
  }

  function updateStats() {
    refs.hudMesas.textContent = state.occupancy > 0 ? String(vectorData.mesaCenters.length) : "0";
    refs.hudPratos.textContent = String(state.sim.activePlates.length);
    refs.hudWalkers.textContent = String(getTotalWalkers());
    refs.hudNodes.textContent = String(getTotalNodes());
  }

  function renderStack() {
    refs.stackUnder.innerHTML = "";
    refs.stackOver.innerHTML = "";
    const act = getAct();

    STACK_LAYERS.forEach(function (layer) {
      const el = document.createElement("div");
      el.className = "vector-layer";
      el.style.transform = "translateY(" + layer.y + "px) scale(" + layer.scale + ")";
      el.style.opacity = String(layer.opacity);
      el.innerHTML = createAssetSvg(vectorData.assets[layer.key], layer.key, act);
      if (layer.target === "over") {
        refs.stackOver.appendChild(el);
      } else {
        refs.stackUnder.appendChild(el);
      }
    });

    updateStackVisibility();
  }

  function updateStackVisibility() {
    [refs.stackUnder, refs.stackOver].forEach(function (stack) {
      stack.querySelectorAll(".vector-layer").forEach(function (layer) {
        layer.classList.toggle("is-hidden", !state.showVectors);
      });
    });
  }

  function createAssetSvg(asset, key, act) {
    const transform = getFitTransform(asset);
    const fill = getLayerFill(key, act.palette);
    const paths = asset.paths
      .map(function (path) {
        return '<path d="' + path.d + '" fill="' + fill + '"></path>';
      })
      .join("");

    return (
      '<svg viewBox="0 0 ' +
      ARTBOARD.width +
      " " +
      ARTBOARD.height +
      '" xmlns="http://www.w3.org/2000/svg"><g transform="translate(' +
      round(transform.x) +
      " " +
      round(transform.y) +
      ") scale(" +
      round(transform.scale) +
      ')">' +
      paths +
      "</g></svg>"
    );
  }

  function applyTheme(act) {
    document.documentElement.style.setProperty("--shell-bg-a", act.palette.bgStart);
    document.documentElement.style.setProperty("--shell-bg-b", act.palette.bgEnd);
    document.documentElement.style.setProperty("--accent", act.palette.secondary);
    document.documentElement.style.setProperty("--artboard-glow-a", rgba(act.palette.glow, 0.54));
    document.documentElement.style.setProperty("--artboard-glow-b", rgba(act.palette.secondary, 0.18));
    document.documentElement.style.setProperty("--artboard-glow-c", rgba(act.palette.tertiary, 0.16));
  }

  function getAct() {
    return acts.find(function (act) {
      return act.id === state.activeId;
    }) || acts[0];
  }

  function getLayerFill(key, palette) {
    if (key === "base") return palette.baseTint;
    if (key === "level1") return palette.level1;
    if (key === "level2") return palette.level2;
    if (key === "level3") return palette.level3;
    if (key === "mesas") return palette.mesa;
    if (key === "plates") return palette.plate;
    return palette.top;
  }

  function getColonyColors(key, palette) {
    const whitePrimary = String(palette.primary).toLowerCase() === "#ffffff";

    if (key === "base") {
      return {
        core: mixColor(palette.tertiary, palette.primary, 0.45),
        glow: palette.glow,
        lineA: mixColor(palette.line, palette.spark, 0.2),
        lineB: palette.tertiary,
        bridge: palette.secondary,
        edge: palette.spark,
        walker: palette.spark,
        walkerGlow: palette.glow,
      };
    }

    if (key === "level1") {
      return {
        core: whitePrimary ? mixColor(palette.primary, palette.secondary, 0.34) : palette.primary,
        glow: palette.glow,
        lineA: whitePrimary ? mixColor(palette.primary, palette.secondary, 0.2) : palette.primary,
        lineB: whitePrimary ? palette.spark : palette.secondary,
        bridge: palette.spark,
        edge: palette.spark,
        walker: palette.secondary,
        walkerGlow: palette.glow,
      };
    }

    if (key === "level2") {
      return {
        core: palette.secondary,
        glow: palette.glow,
        lineA: palette.secondary,
        lineB: palette.tertiary,
        bridge: palette.spark,
        edge: palette.primary,
        walker: palette.secondary,
        walkerGlow: palette.glow,
      };
    }

    return {
      core: mixColor(palette.tertiary, palette.primary, 0.24),
      glow: palette.glow,
      lineA: palette.tertiary,
      lineB: palette.primary,
      bridge: palette.secondary,
      edge: palette.spark,
      walker: whitePrimary ? palette.spark : palette.primary,
      walkerGlow: palette.glow,
    };
  }

  function getFitTransform(asset) {
    const vb = asset.viewBox;
    const scale = Math.min(ARTBOARD.width / vb[2], ARTBOARD.height / vb[3]);
    return {
      scale: scale,
      x: (ARTBOARD.width - vb[2] * scale) * 0.5 - vb[0] * scale,
      y: (ARTBOARD.height - vb[3] * scale) * 0.5 - vb[1] * scale,
    };
  }

  function pointInMask(maskKey, x, y) {
    if (maskKey === "base") return x >= 0 && y >= 0 && x < ARTBOARD.width && y < ARTBOARD.height;
    const mask = state.masks[maskKey];
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (!mask || xi < 0 || yi < 0 || xi >= ARTBOARD.width || yi >= ARTBOARD.height) return false;
    return mask[(yi * ARTBOARD.width + xi) * 4 + 3] > 10;
  }

  function findNearest(x, y, nodes, stickDistance, maxAxis) {
    let bestIndex = null;
    let bestDistanceSq = Infinity;
    let altIndex = null;
    let altDistanceSq = maxAxis * maxAxis;

    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const dx = x - nodes[i].x;
      const dy = y - nodes[i].y;
      if (Math.abs(dx) > maxAxis || Math.abs(dy) > maxAxis) continue;

      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < bestDistanceSq) {
        altIndex = bestIndex;
        altDistanceSq = bestDistanceSq;
        bestIndex = i;
        bestDistanceSq = distanceSq;
      } else if (distanceSq < altDistanceSq) {
        altIndex = i;
        altDistanceSq = distanceSq;
      }

      if (bestDistanceSq <= stickDistance * stickDistance * 0.35) break;
    }

    if (bestIndex === null) return null;
    return { index: bestIndex, distanceSq: bestDistanceSq, altIndex: altIndex };
  }

  function getTotalWalkers() {
    return state.sim.colonies.reduce(function (sum, colony) {
      return sum + colony.walkers.length;
    }, 0);
  }

  function getTotalNodes() {
    return state.sim.colonies.reduce(function (sum, colony) {
      return sum + colony.nodes.length;
    }, 0);
  }

  function scalePoint(point, width, height) {
    return {
      x: (point.x / ARTBOARD.width) * width,
      y: (point.y / ARTBOARD.height) * height,
    };
  }

  function copyPoint(point) {
    return { x: point.cx || point.x, y: point.cy || point.y };
  }

  function hexToRgb(color) {
    if (color.indexOf("rgb") === 0) {
      const values = color.match(/[\d.]+/g) || ["0", "0", "0"];
      return {
        r: Number(values[0] || 0),
        g: Number(values[1] || 0),
        b: Number(values[2] || 0),
      };
    }

    const hex = color.replace("#", "");
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  function rgba(color, alpha) {
    const rgb = hexToRgb(color);
    return "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + clamp(alpha, 0, 1) + ")";
  }

  function mixColor(a, b, t) {
    const start = hexToRgb(a);
    const end = hexToRgb(b);
    return (
      "rgb(" +
      Math.round(lerp(start.r, end.r, t)) +
      "," +
      Math.round(lerp(start.g, end.g, t)) +
      "," +
      Math.round(lerp(start.b, end.b, t)) +
      ")"
    );
  }

  function mixAngles(a, b, t) {
    const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + delta * clamp(t, 0, 1);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function round(value) {
    return Math.round(value * 1000) / 1000;
  }
})();
