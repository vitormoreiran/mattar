(function () {
  const acts = window.DLA_ACTS || [];
  if (!acts.length) return;

  const refs = {
    actList: document.getElementById("act-list"),
    plates: document.getElementById("plates"),
    platesValue: document.getElementById("plates-value"),
    stability: document.getElementById("stability"),
    stabilityValue: document.getElementById("stability-value"),
    exchange: document.getElementById("exchange"),
    exchangeValue: document.getElementById("exchange-value"),
    echo: document.getElementById("echo"),
    application: document.getElementById("act-application"),
    palette: document.getElementById("palette"),
    notes: document.getElementById("notes"),
    hudName: document.getElementById("hud-name"),
    hudStatement: document.getElementById("hud-statement"),
    hudSeeds: document.getElementById("hud-seeds"),
    hudWalkers: document.getElementById("hud-walkers"),
    hudSticky: document.getElementById("hud-sticky"),
    hudNodes: document.getElementById("hud-nodes"),
    canvas: document.getElementById("scene"),
  };

  const ctx = refs.canvas.getContext("2d");
  const state = {
    activeId: acts[0].id,
    plates: Number(refs.plates.value),
    stability: Number(refs.stability.value),
    exchange: Number(refs.exchange.value),
    echo: refs.echo.checked,
    runtime: null,
    sim: null,
    phase: 0,
    lastTs: 0,
    resetCountdown: 0,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  };

  init();
  window.addEventListener("resize", handleResize);
  window.requestAnimationFrame(frame);

  function init() {
    renderActButtons();
    bindControls();
    handleResize();
    rebuild();
  }

  function bindControls() {
    refs.plates.addEventListener("input", function () {
      state.plates = Number(refs.plates.value);
      refs.platesValue.textContent = String(state.plates);
      rebuild();
    });

    refs.stability.addEventListener("input", function () {
      state.stability = Number(refs.stability.value);
      refs.stabilityValue.textContent = String(state.stability);
      rebuild();
    });

    refs.exchange.addEventListener("input", function () {
      state.exchange = Number(refs.exchange.value);
      refs.exchangeValue.textContent = String(state.exchange);
      rebuild();
    });

    refs.echo.addEventListener("change", function () {
      state.echo = refs.echo.checked;
      rebuild();
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
        rebuild();
      });
      refs.actList.appendChild(button);
    });
  }

  function handleResize() {
    const rect = refs.canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(420, Math.round(rect.height));

    refs.canvas.width = Math.round(width * state.dpr);
    refs.canvas.height = Math.round(height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    if (state.runtime) rebuild();
  }

  function rebuild() {
    const act = getActiveAct();
    state.runtime = buildRuntime(act);
    state.sim = createSimulation(state.runtime);
    state.resetCountdown = 0;
    updateUi(act, state.runtime);
    syncActButtons();
  }

  function syncActButtons() {
    refs.actList.querySelectorAll(".act-button").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.actId === state.activeId);
    });
  }

  function getActiveAct() {
    return acts.find(function (act) {
      return act.id === state.activeId;
    }) || acts[0];
  }

  function buildRuntime(act) {
    const behavior = act.behavior;
    const platesNorm = clamp(state.plates / 6, 0, 1);
    const stabilityNorm = clamp(state.stability / 100, 0, 1);
    const exchangeNorm = clamp(state.exchange / 100, 0, 1);
    const width = refs.canvas.width / state.dpr;
    const height = refs.canvas.height / state.dpr;
    const minDim = Math.min(width, height);
    const seedCount = Math.max(1, Math.round(behavior.baseSeeds + platesNorm * 2));

    return {
      width: width,
      height: height,
      centerX: width * 0.55,
      centerY: height * 0.52,
      seedCount: seedCount,
      walkerCount: clamp(Math.round(behavior.walkers + state.plates * 10 + exchangeNorm * 28), 60, 240),
      maxNodes: Math.round(behavior.maxNodes + state.plates * 54 + stabilityNorm * 80),
      stickDistance: behavior.stickDistance + stabilityNorm * 2.2 + platesNorm * 1.6,
      stickyChance: clamp(behavior.stickyChance + stabilityNorm * 0.12 - exchangeNorm * 0.05, 0.03, 0.42),
      stepSize: Math.max(1.5, behavior.stepSize + exchangeNorm * 1.2 - stabilityNorm * 0.4),
      turnRate: behavior.turnRate + exchangeNorm * 0.35,
      orbit: behavior.orbit + exchangeNorm * 0.006,
      inwardPull: Math.max(0.003, behavior.inwardPull + stabilityNorm * 0.01 - exchangeNorm * 0.003),
      childScale: behavior.childScale,
      nodeSize: behavior.nodeSize + platesNorm * 0.35,
      bridgeDistance: behavior.bridgeDistance + platesNorm * 32 + (state.echo ? 26 : 0),
      bridgeChance: state.echo ? clamp(behavior.bridgeChance + platesNorm * 0.06, 0, 0.34) : 0,
      lineAlpha: behavior.lineAlpha,
      trailFade: clamp(behavior.trailFade + exchangeNorm * 0.02 - stabilityNorm * 0.01, 0.045, 0.16),
      bloom: behavior.bloom,
      shape: behavior.shape,
      geometry: behavior.geometry,
      showWalkers: behavior.showWalkers || exchangeNorm > 0.42,
      seedPattern: behavior.seedPattern,
      spawnRadius: minDim * (0.30 + platesNorm * 0.06),
      farRadius: minDim * (0.47 + exchangeNorm * 0.08),
      walkerSize: 1.2 + exchangeNorm * 0.8,
      exchangeNorm: exchangeNorm,
      stabilityNorm: stabilityNorm,
      platesNorm: platesNorm,
      palette: act.palette,
      act: act,
    };
  }

  function createSimulation(runtime) {
    const seeds = buildSeeds(runtime);
    const nodes = seeds.map(function (seed, index) {
      return {
        x: seed.x,
        y: seed.y,
        parentIndex: null,
        bridgeIndex: null,
        generation: 0,
        seedIndex: index,
        size: runtime.nodeSize * 1.9,
        tint: index / Math.max(1, seeds.length - 1 || 1),
      };
    });

    const walkers = [];
    for (let i = 0; i < runtime.walkerCount; i += 1) {
      walkers.push(createWalker(runtime, seeds));
    }

    return {
      nodes: nodes,
      walkers: walkers,
      seeds: seeds,
    };
  }

  function buildSeeds(runtime) {
    const seeds = [];
    const count = runtime.seedCount;
    const cx = runtime.centerX;
    const cy = runtime.centerY;
    const radius = runtime.spawnRadius * 0.35;

    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : i / count;

      if (runtime.seedPattern === "single") {
        seeds.push({ x: cx, y: cy });
        break;
      }

      if (runtime.seedPattern === "line") {
        const spread = radius * 1.6;
        const x = cx + lerp(-spread, spread, count === 1 ? 0.5 : i / (count - 1));
        const y = cy + Math.sin(t * Math.PI * 2) * radius * 0.16;
        seeds.push({ x: x, y: y });
        continue;
      }

      if (runtime.seedPattern === "swarm") {
        const angle = t * Math.PI * 2 + Math.random() * 0.6;
        const local = radius * (0.32 + Math.random() * 0.75);
        seeds.push({
          x: cx + Math.cos(angle) * local,
          y: cy + Math.sin(angle) * local * 0.7,
        });
        continue;
      }

      if (runtime.seedPattern === "spiral") {
        const angle = t * Math.PI * 1.8 + 0.45;
        const local = radius * (0.28 + t * 0.95);
        seeds.push({
          x: cx + Math.cos(angle) * local,
          y: cy + Math.sin(angle) * local * 0.72,
        });
        continue;
      }

      const angle = t * Math.PI * 2 - Math.PI / 2;
      seeds.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius * 0.78,
      });
    }

    return seeds;
  }

  function createWalker(runtime, seeds) {
    const angle = Math.random() * Math.PI * 2;
    const seed = seeds[Math.floor(Math.random() * seeds.length)] || { x: runtime.centerX, y: runtime.centerY };
    const spawn = runtime.farRadius * (0.74 + Math.random() * 0.34);
    return {
      x: seed.x + Math.cos(angle) * spawn,
      y: seed.y + Math.sin(angle) * spawn,
      angle: angle + Math.PI,
      speed: runtime.stepSize * (0.8 + Math.random() * 0.45),
      wobble: Math.random() * Math.PI * 2,
    };
  }

  function frame(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(1.8, (ts - state.lastTs) / 16.6667);
    state.lastTs = ts;
    state.phase += dt * 0.015;

    if (state.sim && state.runtime) {
      stepSimulation(dt);
      render();
    }

    window.requestAnimationFrame(frame);
  }

  function stepSimulation(dt) {
    const runtime = state.runtime;
    const sim = state.sim;
    const nodes = sim.nodes;

    if (nodes.length >= runtime.maxNodes) {
      state.resetCountdown += dt;
      if (state.resetCountdown > 64) {
        state.sim = createSimulation(runtime);
        state.resetCountdown = 0;
      }
    } else {
      state.resetCountdown = 0;
    }

    while (sim.walkers.length < runtime.walkerCount) {
      sim.walkers.push(createWalker(runtime, sim.seeds));
    }

    if (sim.walkers.length > runtime.walkerCount) {
      sim.walkers.length = runtime.walkerCount;
    }

    for (let i = 0; i < sim.walkers.length; i += 1) {
      const walker = sim.walkers[i];
      updateWalker(walker, runtime, dt);

      if (isWalkerOut(walker, runtime)) {
        sim.walkers[i] = createWalker(runtime, sim.seeds);
        continue;
      }

      const nearest = findNearestNode(walker.x, walker.y, nodes, runtime.stickDistance, runtime.bridgeDistance);
      if (!nearest) continue;

      if (nearest.distanceSq <= runtime.stickDistance * runtime.stickDistance && Math.random() < runtime.stickyChance) {
        const parent = nodes[nearest.index];
        const generation = parent.generation + 1;
        const node = {
          x: walker.x,
          y: walker.y,
          parentIndex: nearest.index,
          bridgeIndex: null,
          generation: generation,
          seedIndex: parent.seedIndex,
          size: Math.max(0.72, runtime.nodeSize * Math.pow(runtime.childScale, generation)),
          tint: clamp(parent.tint + (Math.random() - 0.5) * 0.16 + 0.05, 0, 1),
        };

        if (runtime.bridgeChance > 0 && nearest.alternateIndex !== null && Math.random() < runtime.bridgeChance) {
          node.bridgeIndex = nearest.alternateIndex;
        }

        nodes.push(node);
        sim.walkers[i] = createWalker(runtime, sim.seeds);
      }
    }

    refs.hudNodes.textContent = String(nodes.length);
  }

  function updateWalker(walker, runtime, dt) {
    const dx = runtime.centerX - walker.x;
    const dy = runtime.centerY - walker.y;
    const centerAngle = Math.atan2(dy, dx);
    const wander = (Math.random() - 0.5) * runtime.turnRate;
    const orbit = Math.sin(state.phase + walker.wobble) * runtime.orbit * 24;

    walker.angle += wander + orbit;
    walker.angle = mixAngles(walker.angle, centerAngle, runtime.inwardPull * (0.7 + runtime.stabilityNorm * 0.6));

    const speed = walker.speed * dt;
    walker.x += Math.cos(walker.angle) * speed;
    walker.y += Math.sin(walker.angle) * speed;
  }

  function isWalkerOut(walker, runtime) {
    const dx = walker.x - runtime.centerX;
    const dy = walker.y - runtime.centerY;
    return dx * dx + dy * dy > runtime.farRadius * runtime.farRadius * 1.4;
  }

  function findNearestNode(x, y, nodes, stickDistance, bridgeDistance) {
    let bestIndex = null;
    let bestDistanceSq = Infinity;
    let alternateIndex = null;
    let alternateDistanceSq = bridgeDistance * bridgeDistance;
    const axisLimit = bridgeDistance;

    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const node = nodes[i];
      const dx = x - node.x;
      const dy = y - node.y;

      if (Math.abs(dx) > axisLimit || Math.abs(dy) > axisLimit) continue;

      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < bestDistanceSq) {
        alternateIndex = bestIndex;
        alternateDistanceSq = bestDistanceSq;
        bestIndex = i;
        bestDistanceSq = distanceSq;
      } else if (distanceSq < alternateDistanceSq) {
        alternateIndex = i;
        alternateDistanceSq = distanceSq;
      }

      if (bestDistanceSq <= stickDistance * stickDistance * 0.4 && alternateDistanceSq <= bridgeDistance * bridgeDistance * 0.5) {
        break;
      }
    }

    if (bestIndex === null) return null;

    return {
      index: bestIndex,
      distanceSq: bestDistanceSq,
      alternateIndex: alternateIndex,
    };
  }

  function render() {
    const runtime = state.runtime;
    const palette = runtime.palette;
    const width = runtime.width;
    const height = runtime.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    paintAtmosphere(runtime);
    paintGeometry(runtime);
    paintConnections(runtime);
    paintNodes(runtime);
    if (runtime.showWalkers) paintWalkers(runtime);
  }

  function paintAtmosphere(runtime) {
    const palette = runtime.palette;
    const width = runtime.width;
    const height = runtime.height;
    const glow = ctx.createRadialGradient(
      runtime.centerX,
      runtime.centerY,
      runtime.spawnRadius * 0.08,
      runtime.centerX,
      runtime.centerY,
      runtime.farRadius * 1.05
    );

    glow.addColorStop(0, applyAlpha(palette.glow, 0.30 + runtime.bloom * 0.12));
    glow.addColorStop(0.45, applyAlpha(palette.secondary, 0.10 + runtime.bloom * 0.05));
    glow.addColorStop(1, applyAlpha(palette.bg, 0));

    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, applyAlpha(palette.primary, 0.05));
    wash.addColorStop(1, applyAlpha(palette.tertiary, 0.05));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
  }

  function paintGeometry(runtime) {
    const cx = runtime.centerX;
    const cy = runtime.centerY;
    const radius = runtime.spawnRadius;
    ctx.save();
    ctx.strokeStyle = applyAlpha(runtime.palette.line, 0.12 + runtime.exchangeNorm * 0.04);
    ctx.lineWidth = 1;

    if (runtime.geometry === "rings") {
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius * (0.38 + i * 0.22), radius * (0.26 + i * 0.15), state.phase * 2 + i * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (runtime.geometry === "spine") {
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius * 0.8);
      ctx.lineTo(cx, cy + radius * 0.82);
      ctx.stroke();
    } else if (runtime.geometry === "grid") {
      const cols = 4;
      for (let i = -cols; i <= cols; i += 1) {
        ctx.beginPath();
        ctx.moveTo(cx + i * radius * 0.22, cy - radius * 0.86);
        ctx.lineTo(cx + i * radius * 0.22, cy + radius * 0.86);
        ctx.stroke();
      }
      for (let j = -2; j <= 2; j += 1) {
        ctx.beginPath();
        ctx.moveTo(cx - radius, cy + j * radius * 0.28);
        ctx.lineTo(cx + radius, cy + j * radius * 0.28);
        ctx.stroke();
      }
    } else if (runtime.geometry === "burst") {
      for (let i = 0; i < 14; i += 1) {
        const angle = (i / 14) * Math.PI * 2 + state.phase * 2.4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * radius * 0.92, cy + Math.sin(angle) * radius * 0.72);
        ctx.stroke();
      }
    } else if (runtime.geometry === "petals") {
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius * 0.22, radius * 0.82, state.phase * 3 + i * (Math.PI / 2.5), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function paintConnections(runtime) {
    const nodes = state.sim.nodes;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = applyAlpha(runtime.palette.line, runtime.lineAlpha);

    for (let i = runtime.seedCount; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (node.parentIndex === null) continue;
      const parent = nodes[node.parentIndex];
      const tone = clamp(node.generation / Math.max(1, runtime.maxNodes * 0.08), 0, 1);
      ctx.strokeStyle = applyAlpha(interpolateHex(runtime.palette.primary, runtime.palette.tertiary, tone), runtime.lineAlpha);
      ctx.beginPath();
      ctx.moveTo(node.x, node.y);
      ctx.lineTo(parent.x, parent.y);
      ctx.stroke();

      if (node.bridgeIndex !== null) {
        const bridge = nodes[node.bridgeIndex];
        ctx.strokeStyle = applyAlpha(runtime.palette.secondary, runtime.lineAlpha * 0.7);
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(bridge.x, bridge.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function paintNodes(runtime) {
    const nodes = state.sim.nodes;
    const seeds = state.sim.seeds;
    ctx.save();

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const color = interpolateHex(runtime.palette.primary, runtime.palette.tertiary, clamp(node.tint, 0, 1));
      const glow = interpolateHex(runtime.palette.glow, runtime.palette.secondary, clamp(node.generation / 28, 0, 1));
      drawNode(node, color, glow, runtime.shape);
    }

    for (let i = 0; i < seeds.length; i += 1) {
      const seed = seeds[i];
      const seedColor = interpolateHex(runtime.palette.seed, runtime.palette.glow, i / Math.max(1, seeds.length - 1 || 1));
      ctx.fillStyle = seedColor;
      ctx.beginPath();
      ctx.arc(seed.x, seed.y, runtime.nodeSize * 2.15, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawNode(node, fillColor, glowColor, shape) {
    const size = node.size;

    ctx.save();
    ctx.fillStyle = fillColor;
    ctx.shadowColor = applyAlpha(glowColor, 0.32);
    ctx.shadowBlur = 12;
    ctx.translate(node.x, node.y);

    if (shape === "diamond") {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-size * 0.7, -size * 0.7, size * 1.4, size * 1.4);
    } else if (shape === "square") {
      ctx.fillRect(-size * 0.65, -size * 0.65, size * 1.3, size * 1.3);
    } else if (shape === "shard") {
      ctx.rotate(node.generation * 0.09);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.55, 0);
      ctx.lineTo(0, size * 1.2);
      ctx.lineTo(-size * 0.7, size * 0.12);
      ctx.closePath();
      ctx.fill();
    } else if (shape === "petal") {
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.65, size * 1.08, node.generation * 0.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function paintWalkers(runtime) {
    const walkers = state.sim.walkers;
    ctx.save();
    ctx.fillStyle = applyAlpha(runtime.palette.line, 0.28 + runtime.exchangeNorm * 0.12);

    for (let i = 0; i < walkers.length; i += 1) {
      const walker = walkers[i];
      ctx.beginPath();
      ctx.arc(walker.x, walker.y, runtime.walkerSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function updateUi(act, runtime) {
    refs.application.textContent = act.application;
    refs.hudName.textContent = act.name;
    refs.hudStatement.textContent = act.statement;
    refs.hudSeeds.textContent = String(runtime.seedCount);
    refs.hudWalkers.textContent = String(runtime.walkerCount);
    refs.hudSticky.textContent = Math.round(runtime.stickyChance * 100) + "%";
    refs.hudNodes.textContent = "0";

    refs.notes.innerHTML = "";
    act.variableNotes.forEach(function (note) {
      const item = document.createElement("li");
      item.textContent = note;
      refs.notes.appendChild(item);
    });

    refs.palette.innerHTML = "";
    [
      ["bg", act.palette.bg],
      ["primary", act.palette.primary],
      ["secondary", act.palette.secondary],
      ["glow", act.palette.glow],
      ["seed", act.palette.seed],
    ].forEach(function (entry) {
      const wrapper = document.createElement("div");
      wrapper.className = "swatch";
      const chip = document.createElement("div");
      chip.className = "swatch__chip";
      chip.style.background = entry[1];
      const label = document.createElement("span");
      label.className = "swatch__label";
      label.textContent = entry[0];
      wrapper.appendChild(chip);
      wrapper.appendChild(label);
      refs.palette.appendChild(wrapper);
    });
  }

  function interpolateHex(a, b, t) {
    const start = hexToRgb(a);
    const end = hexToRgb(b);
    const mix = {
      r: Math.round(lerp(start.r, end.r, t)),
      g: Math.round(lerp(start.g, end.g, t)),
      b: Math.round(lerp(start.b, end.b, t)),
    };
    return "rgb(" + mix.r + ", " + mix.g + ", " + mix.b + ")";
  }

  function applyAlpha(color, alpha) {
    const rgb = hexToRgb(color);
    return "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", " + clamp(alpha, 0, 1) + ")";
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
    const normalized = hex.length === 3
      ? hex.split("").map(function (chunk) { return chunk + chunk; }).join("")
      : hex;
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function mixAngles(a, b, t) {
    const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + delta * clamp(t, 0, 1);
  }
})();
