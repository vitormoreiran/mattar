(function () {
  const acts = window.MESA_ACTS || [];
  const vectorData = window.MESA_VECTOR_DATA;
  if (!acts.length || !vectorData) return;

  const ARTBOARD = vectorData.artboard;
  const BALANCED_PLATE_ORDER = [0, 3, 1, 4, 2, 5];
  const STACK_LAYERS = [
    { key: "base", y: 0, scale: 1, opacity: 0.86 },
    { key: "level1", y: -12, scale: 0.996, opacity: 0.58 },
    { key: "level2", y: -24, scale: 0.992, opacity: 0.5 },
    { key: "level3", y: -38, scale: 0.988, opacity: 0.44 },
    { key: "mesas", y: -52, scale: 0.985, opacity: 0.28 },
    { key: "plates", y: -60, scale: 0.982, opacity: 0.36 },
    { key: "topCrop", y: -76, scale: 0.975, opacity: 0.16 },
  ];

  const refs = {
    actList: document.getElementById("act-list"),
    occupancy: document.getElementById("occupancy"),
    occupancyValue: document.getElementById("occupancy-value"),
    stability: document.getElementById("stability"),
    stabilityValue: document.getElementById("stability-value"),
    exchange: document.getElementById("exchange"),
    exchangeValue: document.getElementById("exchange-value"),
    showVectors: document.getElementById("show-vectors"),
    application: document.getElementById("act-application"),
    palette: document.getElementById("palette"),
    hudName: document.getElementById("hud-name"),
    hudStatement: document.getElementById("hud-statement"),
    hudMesas: document.getElementById("hud-mesas"),
    hudPratos: document.getElementById("hud-pratos"),
    hudNodes: document.getElementById("hud-nodes"),
    hudRegime: document.getElementById("hud-regime"),
    factMesas: document.getElementById("fact-mesas"),
    factPratos: document.getElementById("fact-pratos"),
    factLevels: document.getElementById("fact-levels"),
    canvas: document.getElementById("scene"),
    artboard: document.getElementById("artboard"),
    stack: document.getElementById("vector-stack"),
  };

  const ctx = refs.canvas.getContext("2d");
  const state = {
    activeId: acts[0].id,
    occupancy: Number(refs.occupancy.value),
    stability: Number(refs.stability.value),
    exchange: Number(refs.exchange.value),
    showVectors: refs.showVectors.checked,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    phase: 0,
    lastTs: 0,
    masks: {},
    sim: null,
  };

  init();

  function init() {
    refs.factMesas.textContent = String(vectorData.mesaCenters.length);
    refs.factPratos.textContent = String(vectorData.plateAnchors.length);
    refs.factLevels.textContent = "4";
    buildMasks();
    renderActButtons();
    bindControls();
    renderStack();
    handleResize();
    rebuildSimulation();
    window.addEventListener("resize", handleResize);
    window.requestAnimationFrame(frame);
  }

  function bindControls() {
    refs.occupancy.addEventListener("input", function () {
      state.occupancy = Number(refs.occupancy.value);
      refs.occupancyValue.textContent = String(state.occupancy);
      rebuildSimulation();
    });

    refs.stability.addEventListener("input", function () {
      state.stability = Number(refs.stability.value);
      refs.stabilityValue.textContent = String(state.stability);
      rebuildSimulation();
    });

    refs.exchange.addEventListener("input", function () {
      state.exchange = Number(refs.exchange.value);
      refs.exchangeValue.textContent = String(state.exchange);
      rebuildSimulation();
    });

    refs.showVectors.addEventListener("change", function () {
      state.showVectors = refs.showVectors.checked;
      renderStack();
    });
  }

  function renderActButtons() {
    refs.actList.innerHTML = "";
    acts.forEach(function (act) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "act-button";
      button.dataset.actId = act.id;
      button.innerHTML =
        '<div class="act-button__top"><strong class="act-button__name">' +
        act.name +
        '</strong><span class="act-button__eyebrow">' +
        act.eyebrow +
        '</span></div><p class="act-button__statement">' +
        act.statement +
        "</p>";
      button.addEventListener("click", function () {
        state.activeId = act.id;
        renderStack();
        rebuildSimulation();
      });
      refs.actList.appendChild(button);
    });
    syncActButtons();
  }

  function syncActButtons() {
    refs.actList.querySelectorAll(".act-button").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.actId === state.activeId);
    });
  }

  function renderStack() {
    refs.stack.innerHTML = "";
    const act = getAct();

    STACK_LAYERS.forEach(function (layer) {
      const el = document.createElement("div");
      el.className = "vector-layer" + (state.showVectors ? "" : " is-hidden");
      el.style.transform = "translateY(" + layer.y + "px) scale(" + layer.scale + ")";
      el.style.opacity = String(layer.opacity);
      el.innerHTML = createAssetSvg(vectorData.assets[layer.key], layer.key, act);
      refs.stack.appendChild(el);
    });
  }

  function createAssetSvg(asset, key, act) {
    const transform = getFitTransform(asset);
    const fill = getLayerFill(key, act.palette);
    const viewBox = "0 0 " + ARTBOARD.width + " " + ARTBOARD.height;
    const paths = asset.paths
      .map(function (path) {
        return '<path d="' + path.d + '" fill="' + fill + '"></path>';
      })
      .join("");
    return (
      '<svg viewBox="' +
      viewBox +
      '" xmlns="http://www.w3.org/2000/svg">' +
      '<g transform="translate(' +
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

      state.masks[key] = {
        data: maskCtx.getImageData(0, 0, ARTBOARD.width, ARTBOARD.height).data,
      };
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
    const mesaSeeds = vectorData.mesaCenters.map(copyPoint);
    const plateSeeds = getActivePlateAnchors();

    state.sim = {
      act: act,
      activePlates: plateSeeds,
      colonies: [
        createColony({
          key: "base",
          maskKey: "base",
          seeds: mesaSeeds,
          walkers: 80 + Math.round(exchangeNorm * 40),
          maxNodes: 120 + Math.round(occupancyNorm * 80),
          stickDistance: 11,
          stickChance: 0.04 + stabilityNorm * 0.03,
          stepSize: 2.4 + exchangeNorm * 0.9,
          turnRate: 0.7 + exchangeNorm * 0.2,
          pull: 0.02,
          bridgeChance: 0.01,
          nodeSize: 2.4,
        }),
        createColony({
          key: "level1",
          maskKey: "level1",
          seeds: plateSeeds,
          walkers: 120 + Math.round(occupancyNorm * 50),
          maxNodes: 340 + Math.round(stabilityNorm * 160),
          stickDistance: 11 + stabilityNorm * 2,
          stickChance: 0.1 + stabilityNorm * 0.14,
          stepSize: 1.9 + exchangeNorm * 0.45,
          turnRate: 0.54 + exchangeNorm * 0.18,
          pull: 0.05,
          bridgeChance: act.id === "redes" ? 0.08 : 0.025,
          nodeSize: 2.9,
        }),
        createColony({
          key: "level2",
          maskKey: "level2",
          seeds: plateSeeds.concat(mesaSeeds),
          walkers: 90 + Math.round(exchangeNorm * 30),
          maxNodes: 280 + Math.round((occupancyNorm + stabilityNorm) * 120),
          stickDistance: 12,
          stickChance: act.id === "redes" ? 0.16 : 0.08 + stabilityNorm * 0.06,
          stepSize: 2.1 + exchangeNorm * 0.7,
          turnRate: 0.82 + exchangeNorm * 0.3,
          pull: 0.035,
          bridgeChance: act.id === "redes" || act.id === "poiesis" ? 0.18 : 0.06,
          nodeSize: 2.5,
        }),
        createColony({
          key: "level3",
          maskKey: "level3",
          seeds: mesaSeeds,
          walkers: 70 + Math.round(exchangeNorm * 35),
          maxNodes: 200 + Math.round(stabilityNorm * 120),
          stickDistance: 10,
          stickChance:
            act.id === "individuo"
              ? 0.18
              : act.id === "enxame"
              ? 0.06
              : 0.1 + stabilityNorm * 0.04,
          stepSize: 2 + exchangeNorm * (act.id === "enxame" ? 1.4 : 0.65),
          turnRate: 0.95 + exchangeNorm * (act.id === "enxame" ? 0.7 : 0.22),
          pull: act.id === "enxame" ? 0.012 : 0.03,
          bridgeChance: act.id === "poiesis" ? 0.12 : 0.035,
          nodeSize: 2.2,
        }),
      ],
    };

    updateUi(act, plateSeeds.length);
  }

  function createColony(options) {
    const seeds = options.seeds.length ? options.seeds : [];
    return {
      key: options.key,
      maskKey: options.maskKey,
      seeds: seeds,
      walkers: seeds.length ? buildWalkers(options.walkers, seeds, options.stepSize) : [],
      nodes: seeds.map(function (seed, index) {
        return {
          x: seed.x,
          y: seed.y,
          parent: null,
          bridge: null,
          generation: 0,
          seedIndex: index,
          size: options.nodeSize * 1.6,
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
    };
  }

  function buildWalkers(count, seeds, stepSize) {
    const walkers = [];
    for (let i = 0; i < count; i += 1) walkers.push(createWalker(seeds, stepSize));
    return walkers;
  }

  function createWalker(seeds, stepSize) {
    const seed = seeds[Math.floor(Math.random() * seeds.length)] || { x: ARTBOARD.width / 2, y: ARTBOARD.height / 2 };
    const angle = Math.random() * Math.PI * 2;
    const radius = 22 + Math.random() * 58;
    return {
      x: seed.x + Math.cos(angle) * radius,
      y: seed.y + Math.sin(angle) * radius,
      angle: Math.random() * Math.PI * 2,
      wobble: Math.random() * Math.PI * 2,
      speed: stepSize * (0.8 + Math.random() * 0.4),
      seedIndex: Math.floor(Math.random() * Math.max(1, seeds.length)),
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

  function frame(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(1.8, (ts - state.lastTs) / 16.6667);
    state.lastTs = ts;
    state.phase += dt * 0.016;
    if (state.sim) {
      stepSimulation(dt);
      renderScene();
    }
    window.requestAnimationFrame(frame);
  }

  function stepSimulation(dt) {
    let totalNodes = 0;
    state.sim.colonies.forEach(function (colony) {
      if (!colony.seeds.length) return;
      if (colony.nodes.length > colony.maxNodes) colony.nodes.length = colony.maxNodes;

      for (let i = 0; i < colony.walkers.length; i += 1) {
        const walker = colony.walkers[i];
        updateWalker(walker, colony, dt);
        if (!pointInMask(colony.maskKey, walker.x, walker.y)) {
          colony.walkers[i] = createWalker(colony.seeds, colony.stepSize);
          continue;
        }

        const nearest = findNearest(walker.x, walker.y, colony.nodes, colony.stickDistance, 80);
        if (!nearest) continue;

        if (nearest.distanceSq <= colony.stickDistance * colony.stickDistance && Math.random() < colony.stickChance) {
          const node = {
            x: walker.x,
            y: walker.y,
            parent: nearest.index,
            bridge: null,
            generation: colony.nodes[nearest.index].generation + 1,
            seedIndex: colony.nodes[nearest.index].seedIndex,
            size: Math.max(0.75, colony.nodeSize * Math.pow(0.992, colony.nodes[nearest.index].generation + 1)),
          };
          if (nearest.altIndex !== null && Math.random() < colony.bridgeChance) node.bridge = nearest.altIndex;
          colony.nodes.push(node);
          colony.walkers[i] = createWalker(colony.seeds, colony.stepSize);
        }
      }

      totalNodes += colony.nodes.length;
    });

    refs.hudNodes.textContent = String(totalNodes);
  }

  function updateWalker(walker, colony, dt) {
    const seed = colony.seeds[walker.seedIndex % colony.seeds.length];
    const toSeed = Math.atan2(seed.y - walker.y, seed.x - walker.x);
    const wander = (Math.random() - 0.5) * colony.turnRate;
    walker.angle += wander + Math.sin(state.phase + walker.wobble) * 0.06;
    walker.angle = mixAngles(walker.angle, toSeed, colony.pull);

    const step = walker.speed * dt;
    const nx = walker.x + Math.cos(walker.angle) * step;
    const ny = walker.y + Math.sin(walker.angle) * step;

    if (pointInMask(colony.maskKey, nx, ny)) {
      walker.x = nx;
      walker.y = ny;
      return;
    }

    walker.angle += Math.PI * (0.35 + Math.random() * 0.45);
    const bx = walker.x + Math.cos(walker.angle) * step * 0.5;
    const by = walker.y + Math.sin(walker.angle) * step * 0.5;
    if (pointInMask(colony.maskKey, bx, by)) {
      walker.x = bx;
      walker.y = by;
    }
  }

  function renderScene() {
    const act = state.sim.act;
    const palette = act.palette;
    const width = refs.artboard.clientWidth;
    const height = refs.artboard.clientHeight;

    ctx.clearRect(0, 0, width, height);
    paintBackground(width, height, palette);
    paintMesaHalos(width, height, act);

    state.sim.colonies.forEach(function (colony) {
      paintColony(colony, act);
    });

    paintActivePlates(act);
  }

  function paintBackground(width, height, palette) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, palette.bgStart);
    gradient.addColorStop(1, palette.bgEnd);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.52, height * 0.42, 40, width * 0.52, height * 0.42, width * 0.5);
    glow.addColorStop(0, rgba(palette.glow, 0.28));
    glow.addColorStop(0.4, rgba(palette.secondary, 0.08));
    glow.addColorStop(1, rgba(palette.bgEnd, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  function paintMesaHalos(width, height, act) {
    const palette = act.palette;
    vectorData.mesaCenters.forEach(function (mesa, index) {
      const point = scalePoint(mesa, width, height);
      const radius = 48 + Math.sin(state.phase * 2 + index) * 6;
      const halo = ctx.createRadialGradient(point.x, point.y, 10, point.x, point.y, radius);
      halo.addColorStop(0, rgba(palette.glow, 0.18));
      halo.addColorStop(1, rgba(palette.secondary, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    });
  }

  function paintColony(colony, act) {
    const palette = act.palette;
    const colors = getColonyColors(colony.key, palette);
    const width = refs.artboard.clientWidth;
    const height = refs.artboard.clientHeight;

    ctx.save();
    ctx.lineWidth = colony.key === "level2" ? 1.2 : 1;
    for (let i = colony.seeds.length; i < colony.nodes.length; i += 1) {
      const node = colony.nodes[i];
      if (node.parent === null) continue;
      const p = scalePoint(node, width, height);
      const parent = scalePoint(colony.nodes[node.parent], width, height);
      ctx.strokeStyle = rgba(mixColor(colors.lineA, colors.lineB, clamp(node.generation / 20, 0, 1)), 0.24);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(parent.x, parent.y);
      ctx.stroke();

      if (node.bridge !== null) {
        const bridge = scalePoint(colony.nodes[node.bridge], width, height);
        ctx.strokeStyle = rgba(colors.bridge, 0.18);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(bridge.x, bridge.y);
        ctx.stroke();
      }
    }

    colony.nodes.forEach(function (node) {
      drawNode(scalePoint(node, width, height), node.size * (width / ARTBOARD.width), colors, act.effect);
    });

    if (colony.key !== "level1") {
      ctx.fillStyle = rgba(colors.bridge, act.id === "enxame" ? 0.24 : 0.16);
      colony.walkers.forEach(function (walker) {
        const point = scalePoint(walker, width, height);
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function drawNode(point, size, colors, effect) {
    if (effect === "rgb-delay") {
      [[-2.1, 0.8, "#ff4b83"], [1.8, -0.5, "#4ee2ff"], [0.6, 1.4, "#7b6cff"]].forEach(function (entry) {
        ctx.fillStyle = rgba(entry[2], 0.16);
        ctx.beginPath();
        ctx.arc(point.x + entry[0], point.y + entry[1], size * 1.55, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.fillStyle = rgba(colors.glow, 0.24);
    ctx.beginPath();
    ctx.arc(point.x, point.y, size * 1.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.core;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  function paintActivePlates(act) {
    const width = refs.artboard.clientWidth;
    const height = refs.artboard.clientHeight;
    ctx.save();
    state.sim.activePlates.forEach(function (plate, index) {
      const point = scalePoint(plate, width, height);
      const pulse = 1 + Math.sin(state.phase * 4 + index) * 0.18;
      ctx.strokeStyle = rgba(act.palette.plate, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 7.5 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function updateUi(act, activePlateCount) {
    syncActButtons();
    refs.application.textContent = act.application;
    refs.hudName.textContent = act.name;
    refs.hudStatement.textContent = act.statement;
    refs.hudMesas.textContent = state.occupancy > 0 ? String(vectorData.mesaCenters.length) : "0";
    refs.hudPratos.textContent = String(activePlateCount);
    refs.hudRegime.textContent = act.eyebrow;
    refs.palette.innerHTML = "";
    [
      ["bg", act.palette.bgStart],
      ["core", act.palette.primary],
      ["accent", act.palette.secondary],
      ["alt", act.palette.tertiary],
      ["glow", act.palette.glow],
    ].forEach(function (entry) {
      const wrapper = document.createElement("div");
      wrapper.className = "swatch";
      wrapper.innerHTML =
        '<div class="swatch__chip" style="background:' +
        entry[1] +
        '"></div><span class="swatch__label">' +
        entry[0] +
        "</span>";
      refs.palette.appendChild(wrapper);
    });
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
    if (key === "base") return { core: palette.tertiary, glow: palette.glow, lineA: palette.line, lineB: palette.tertiary, bridge: palette.secondary };
    if (key === "level1") return { core: palette.primary, glow: palette.glow, lineA: palette.primary, lineB: palette.secondary, bridge: palette.spark };
    if (key === "level2") return { core: palette.secondary, glow: palette.glow, lineA: palette.secondary, lineB: palette.tertiary, bridge: palette.spark };
    return { core: palette.tertiary, glow: palette.glow, lineA: palette.tertiary, lineB: palette.primary, bridge: palette.secondary };
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
    return mask.data[(yi * ARTBOARD.width + xi) * 4 + 3] > 10;
  }

  function findNearest(x, y, nodes, stickDistance, altDistance) {
    let bestIndex = null;
    let bestDistanceSq = Infinity;
    let altIndex = null;
    let altDistanceSq = altDistance * altDistance;

    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const dx = x - nodes[i].x;
      const dy = y - nodes[i].y;
      if (Math.abs(dx) > altDistance || Math.abs(dy) > altDistance) continue;
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

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value) {
    return Math.round(value * 1000) / 1000;
  }
})();
