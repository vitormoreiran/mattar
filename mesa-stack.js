(function () {
  const acts = window.MESA_ACTS || [];
  const vectorData = window.MESA_VECTOR_DATA;
  if (!acts.length || !vectorData) return;

  const ARTBOARD = vectorData.artboard || { width: 766, height: 690 };
  const BALANCED_PLATE_ORDER = [0, 3, 1, 4, 2, 5];
  const FIXED_PLATES_PER_MESA = 6;
  const VECTOR_LAYERS = [
    { key: "base", target: "under", file: "./assets/mesa-vectors/base.svg", opacity: 0.52 },
    { key: "level1", target: "under", file: "./assets/mesa-vectors/level-1.svg", opacity: 0.7 },
    { key: "level2", target: "under", file: "./assets/mesa-vectors/level-2.svg", opacity: 0.6 },
    { key: "level3", target: "under", file: "./assets/mesa-vectors/level-3.svg", opacity: 0.54 },
    { key: "top", target: "under", file: "./assets/mesa-vectors/top.svg", opacity: 0.62 },
    { key: "tables", target: "over", file: "./assets/mesa-vectors/tables.svg", opacity: 0.96 },
    { key: "plates", target: "over", file: "./assets/mesa-vectors/plates.svg", opacity: 0.98 },
  ];

  const refs = {
    artboard: document.getElementById("artboard"),
    actList: document.getElementById("act-list"),
    stackUnder: document.getElementById("vector-stack-under"),
    stackOver: document.getElementById("vector-stack-over"),
    particleLayer: document.getElementById("particle-layer"),
    boidLines: document.getElementById("boid-lines"),
    boidDots: document.getElementById("boid-dots"),
    travelerLines: document.getElementById("traveler-lines"),
    travelerDots: document.getElementById("traveler-dots"),
    density: document.getElementById("density"),
    densityValue: document.getElementById("density-value"),
    motion: document.getElementById("motion"),
    motionValue: document.getElementById("motion-value"),
  };

  const state = {
    activeId: getInitialActId(),
    density: Number(refs.density.value),
    motion: Number(refs.motion.value),
    showVectors: true,
    activePlates: [],
    targets: [],
    travelTargets: [],
    boids: [],
    walkers: [],
    travelers: [],
    behavior: null,
    desiredCount: 0,
    spawnCarry: 0,
    links: 0,
    phase: 0,
    lastTs: 0,
  };

  init();

  function init() {
    renderActButtons();
    bindControls();
    renderStack();
    syncUi();
    rebuildBoids();
    window.requestAnimationFrame(frame);
  }

  function getInitialActId() {
    const params = new URLSearchParams(window.location.search);
    const actId = params.get("act");
    return acts.some(function (act) { return act.id === actId; }) ? actId : acts[0].id;
  }

  function bindControls() {
    bindSlider(refs.density, refs.densityValue, "density", rebuildBoids);
    bindSlider(refs.motion, refs.motionValue, "motion", rebuildBoids);
  }

  function bindSlider(input, output, key, onChange) {
    output.textContent = input.value;
    input.addEventListener("input", function () {
      state[key] = Number(input.value);
      output.textContent = input.value;
      onChange();
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
        syncUi();
        rebuildBoids();
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

  function syncUi() {
    syncActButtons();
    applyTheme(getAct());
    updateStackVisibility();
    if (state.boids.length) {
      state.behavior = getActBehavior(getAct(), state.motion / 100, state.density / 100);
      state.desiredCount = state.behavior.maxNodes;
      renderBoids();
    }
  }

  function renderStack() {
    refs.stackUnder.innerHTML = "";
    refs.stackOver.innerHTML = "";

    VECTOR_LAYERS.forEach(function (layer) {
      const wrapper = document.createElement("div");
      wrapper.className = "vector-layer";
      wrapper.dataset.layer = layer.key;
      wrapper.style.opacity = String(layer.opacity);

      const image = document.createElement("img");
      image.className = "vector-image";
      image.alt = "";
      image.src = layer.file;

      wrapper.appendChild(image);
      if (layer.target === "over") {
        refs.stackOver.appendChild(wrapper);
      } else {
        refs.stackUnder.appendChild(wrapper);
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

  function rebuildBoids() {
    const act = getAct();
    const motionNorm = state.motion / 100;
    const densityNorm = state.density / 100;
    state.activePlates = getActivePlateAnchors();
    state.targets = getTargetsForAct(act.id, state.activePlates);
    state.travelTargets = getTravelerTargetsForAct(act.id, state.activePlates);
    state.behavior = getActBehavior(act, motionNorm, densityNorm);
    state.desiredCount = state.behavior.maxNodes;
    state.spawnCarry = 0;
    state.phase = 0;

    const seedTargets = buildSeedTargets(state.targets, state.behavior);
    state.boids = seedTargets.map(function (seed, index) {
      return createBoid(seed, index, seedTargets.length, state.behavior);
    });
    state.walkers = Array.from({ length: state.behavior.walkerCount }, function () {
      return createWalker(state.targets, state.behavior);
    });
    state.travelers = Array.from({ length: state.behavior.travelerCount }, function () {
      return createTraveler(state.travelTargets, state.behavior);
    });
    state.spawnCarry = Math.max(state.spawnCarry, state.behavior.maxNodes * state.behavior.warmupBudget);

    const warmupSteps = Math.round(28 + state.behavior.walkerCount * 2.4 + state.behavior.maxNodes * 0.28);
    for (let step = 0; step < warmupSteps; step += 1) {
      state.phase += 0.015;
      stepBoids(1);
    }

    state.links = 0;
    renderBoids();
    updateStats();
  }

  function createBoid(seedTarget, seedIndex, seedCount, behavior) {
    const seed = seedTarget || {
      x: ARTBOARD.width * 0.5,
      y: ARTBOARD.height * 0.5,
      mesaIndex: 0,
      kind: "mesa",
      targetIndex: 0,
    };

    return {
      x: seed.x,
      y: seed.y,
      baseX: seed.x,
      baseY: seed.y,
      baseSize: behavior.seedSize,
      targetIndex: seed.targetIndex || 0,
      homeIndex: seed.targetIndex || 0,
      homeMesaIndex: seed.mesaIndex || 0,
      returning: false,
      age: Math.random() * 100,
      growth: 1,
      generation: 0,
      seedIndex: seedIndex,
      tint: seedIndex / Math.max(1, seedCount - 1 || 1),
      parentIndex: null,
      bridgeIndex: null,
      isSeed: true,
      pulse: Math.random() * Math.PI * 2,
    };
  }

  function createWalker(targets, behavior, preferredIndex) {
    const homeIndex = typeof preferredIndex === "number" ? preferredIndex : getSpawnTargetIndex(targets, behavior);
    const target = getTargetAt(targets, homeIndex) || {
      x: ARTBOARD.width * 0.5,
      y: ARTBOARD.height * 0.5,
      kind: "mesa",
      mesaIndex: 0,
    };
    const angle = Math.random() * Math.PI * 2;
    const radius = lerp(behavior.spawnRadiusMin, behavior.spawnRadiusMax, Math.random());

    return {
      x: target.x + Math.cos(angle) * radius,
      y: target.y + Math.sin(angle) * radius,
      angle: angle + Math.PI,
      speed: lerp(behavior.speedMin, behavior.speedMax, Math.random()),
      wobble: Math.random() * Math.PI * 2,
      targetIndex: homeIndex,
      homeIndex: homeIndex,
      homeMesaIndex: target.mesaIndex || 0,
      returning: Math.random() < 0.5,
      age: 0,
    };
  }

  function createTraveler(targets, behavior, preferredIndex) {
    const homeIndex = typeof preferredIndex === "number" ? preferredIndex : getSpawnTargetIndex(targets, behavior);
    const home = getTargetAt(targets, homeIndex) || {
      x: ARTBOARD.width * 0.5,
      y: ARTBOARD.height * 0.5,
      kind: "mesa",
      mesaIndex: 0,
    };
    const angle = Math.random() * Math.PI * 2;
    const radius = lerp(behavior.travelerSpawnRadiusMin, behavior.travelerSpawnRadiusMax, Math.random());
    const speed = lerp(behavior.travelerSpeedMin, behavior.travelerSpeedMax, Math.random());
    const traveler = {
      x: home.x + Math.cos(angle) * radius,
      y: home.y + Math.sin(angle) * radius,
      vx: Math.cos(angle + Math.PI * 0.5) * speed,
      vy: Math.sin(angle + Math.PI * 0.5) * speed,
      size: lerp(behavior.travelerSizeMin, behavior.travelerSizeMax, Math.random()),
      homeIndex: homeIndex,
      targetIndex: homeIndex,
      previousTargetIndex: homeIndex,
      homeMesaIndex: home.mesaIndex || 0,
      age: 0,
      pulse: Math.random() * Math.PI * 2,
      returning: Math.random() < 0.5,
    };

    retargetBoid(traveler, behavior, targets);
    return traveler;
  }

  function frame(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(1.8, (ts - state.lastTs) / 16.6667);
    state.lastTs = ts;
    state.phase += dt * 0.015;

    if (state.boids.length || state.walkers.length) {
      stepBoids(dt);
      renderBoids();
    }

    window.requestAnimationFrame(frame);
  }

  function stepBoids(dt) {
    const behavior = state.behavior || getActBehavior(getAct(), state.motion / 100, state.density / 100);
    const targets = state.targets.length ? state.targets : buildMesaTargets();
    const travelTargets = state.travelTargets.length ? state.travelTargets : targets;

    syncBoidPopulation(dt, targets, behavior);

    for (let i = 0; i < state.boids.length; i += 1) {
      const boid = state.boids[i];
      boid.age += dt;
      boid.growth = clamp(boid.growth + behavior.nodeGrowthRate * dt, 0, 1);
    }

    for (let i = 0; i < state.walkers.length; i += 1) {
      const walker = state.walkers[i];
      const target = getTargetAt(targets, walker.targetIndex);

      updateWalker(walker, target, behavior, dt);

      if (isWalkerOut(walker, target, behavior)) {
        state.walkers[i] = createWalker(targets, behavior, walker.targetIndex);
        continue;
      }

      if (
        walker.age > behavior.exchangeDelay &&
        target &&
        distanceBetween(walker, target) < behavior.retargetDistance &&
        Math.random() < behavior.walkerRetargetChance
      ) {
        retargetBoid(walker, behavior, targets);
        walker.age = 0;
      }

      if (state.boids.length >= state.desiredCount || state.spawnCarry < 1) {
        continue;
      }

      const nearest = findNearestNode(walker.x, walker.y, state.boids, behavior.stickDistance, behavior.bridgeDistance);
      if (!nearest) continue;

      if (nearest.distanceSq <= behavior.stickDistance * behavior.stickDistance && Math.random() < behavior.stickyChance) {
        state.boids.push(createChildBoid(walker, nearest, targets, behavior));
        state.spawnCarry = Math.max(0, state.spawnCarry - 1);
        state.walkers[i] = createWalker(targets, behavior, walker.targetIndex);
      }
    }

    stepTravelers(dt, travelTargets, behavior);
  }

  function syncBoidPopulation(dt, targets, behavior) {
    state.desiredCount = behavior.maxNodes;
    state.spawnCarry = Math.min(behavior.spawnRate * 8, state.spawnCarry + behavior.spawnRate * dt);

    while (state.walkers.length < behavior.walkerCount) {
      state.walkers.push(createWalker(targets, behavior));
    }

    if (state.walkers.length > behavior.walkerCount) {
      state.walkers.length = behavior.walkerCount;
    }

    while (state.travelers.length < behavior.travelerCount) {
      state.travelers.push(createTraveler(state.travelTargets.length ? state.travelTargets : targets, behavior));
    }

    if (state.travelers.length > behavior.travelerCount) {
      state.travelers.length = behavior.travelerCount;
    }
  }

  function stepTravelers(dt, targets, behavior) {
    if (!targets.length) return;

    for (let i = 0; i < state.travelers.length; i += 1) {
      const traveler = state.travelers[i];
      const target = getTargetAt(targets, traveler.targetIndex);
      if (!target) continue;

      traveler.age += dt;

      const dx = target.x - traveler.x;
      const dy = target.y - traveler.y;
      const distance = Math.hypot(dx, dy) || 1;
      const wave = 0.55 + 0.45 * Math.sin(state.phase * behavior.travelerPulseSpeed + traveler.pulse);
      let ax = (dx / distance) * behavior.travelerPull;
      let ay = (dy / distance) * behavior.travelerPull;

      ax += (-dy / distance) * behavior.travelerOrbit * wave;
      ay += (dx / distance) * behavior.travelerOrbit * wave;
      ax += (Math.random() - 0.5) * behavior.travelerJitter;
      ay += (Math.random() - 0.5) * behavior.travelerJitter;

      traveler.vx = (traveler.vx + ax * dt) * behavior.travelerDamping;
      traveler.vy = (traveler.vy + ay * dt) * behavior.travelerDamping;

      const speed = Math.hypot(traveler.vx, traveler.vy) || 1;
      if (speed > behavior.travelerMaxSpeed) {
        traveler.vx = (traveler.vx / speed) * behavior.travelerMaxSpeed;
        traveler.vy = (traveler.vy / speed) * behavior.travelerMaxSpeed;
      }

      traveler.x += traveler.vx * dt;
      traveler.y += traveler.vy * dt;

      if (
        distance < behavior.travelerArrivalRadius ||
        (traveler.age > behavior.travelerLegDuration && Math.random() < behavior.travelerRetargetChance)
      ) {
        traveler.previousTargetIndex = traveler.targetIndex;
        retargetBoid(traveler, behavior, targets);
        traveler.age = 0;
      }

      traveler.x = clamp(traveler.x, 10, ARTBOARD.width - 10);
      traveler.y = clamp(traveler.y, 10, ARTBOARD.height - 10);
    }
  }

  function renderBoids() {
    const act = getAct();
    const behavior = state.behavior || getActBehavior(act, state.motion / 100, state.density / 100);
    const lines = [];
    const dots = [];
    const travelerLines = [];
    const travelerDots = [];
    const renderPoints = state.boids.map(function (boid) {
      return getRenderPoint(boid, behavior);
    });
    let links = 0;

    for (let i = 0; i < state.boids.length; i += 1) {
      const boid = state.boids[i];
      const point = renderPoints[i];
      const tone = clamp(boid.tint, 0, 1);
      const coreColor = mixColor(act.palette.primary, act.palette.secondary, 0.18 + tone * 0.62);
      const glowColor = rgba(mixColor(act.palette.glow, act.palette.secondary, 0.14 + tone * 0.34), behavior.glowAlpha);
      const edgeColor = rgba(mixColor(act.palette.spark, "#101010", 0.22), behavior.edgeAlpha);
      const liveSize =
        boid.baseSize *
        (boid.isSeed ? 1.2 : 0.78 + boid.growth * 0.48 + 0.08 * Math.sin(boid.age * behavior.pulseSpeed + boid.pulse));

      if (boid.parentIndex !== null) {
        const parentPoint = renderPoints[boid.parentIndex];
        const lineColor = mixColor(act.palette.secondary, act.palette.tertiary, clamp(tone * 0.58 + behavior.lineMix * 0.24, 0, 1));
        lines.push(
          '<line x1="' +
            round(point.x) +
            '" y1="' +
            round(point.y) +
            '" x2="' +
            round(parentPoint.x) +
            '" y2="' +
            round(parentPoint.y) +
            '" stroke="' +
            rgba(lineColor, behavior.lineAlpha * boid.growth) +
            '" stroke-width="' +
            round(behavior.lineWidth) +
            '" stroke-linecap="round"></line>'
        );
        links += 1;
      }

      if (boid.bridgeIndex !== null) {
        const bridgePoint = renderPoints[boid.bridgeIndex];
        lines.push(
          '<line x1="' +
            round(point.x) +
            '" y1="' +
            round(point.y) +
            '" x2="' +
            round(bridgePoint.x) +
            '" y2="' +
            round(bridgePoint.y) +
            '" stroke="' +
            rgba(mixColor(act.palette.spark, act.palette.secondary, 0.4), behavior.bridgeAlpha * boid.growth) +
            '" stroke-width="' +
            round(behavior.lineWidth * 0.92) +
            '" stroke-linecap="round"></line>'
        );
        links += 1;
      }

      dots.push(
        '<circle cx="' +
          round(point.x) +
          '" cy="' +
          round(point.y) +
          '" r="' +
          round(liveSize * behavior.glowScale) +
          '" fill="' +
          glowColor +
          '"></circle>'
      );

      if (behavior.shape === "diamond") {
        const size = round(liveSize * behavior.dotScale * 1.3);
        dots.push(
          '<rect x="' +
            round(point.x - size * 0.5) +
            '" y="' +
            round(point.y - size * 0.5) +
            '" width="' +
            round(size) +
            '" height="' +
            round(size) +
            '" fill="' +
            coreColor +
            '" stroke="' +
            edgeColor +
            '" stroke-width="0.7" transform="rotate(45 ' +
            round(point.x) +
            " " +
            round(point.y) +
            ')"></rect>'
        );
      } else {
        dots.push(
          '<circle cx="' +
          round(point.x) +
          '" cy="' +
          round(point.y) +
          '" r="' +
          round(liveSize * behavior.dotScale) +
          '" fill="' + coreColor + '" stroke="' + edgeColor + '" stroke-width="0.75"></circle>'
        );
      }
    }

    if (behavior.showWalkerLinks) {
      const walkerStroke = mixColor(act.palette.secondary, act.palette.tertiary, 0.35);
      state.walkers.forEach(function (walker) {
        const nearest = findNearestNode(walker.x, walker.y, state.boids, behavior.bridgeDistance, behavior.bridgeDistance);
        if (!nearest) return;
        const point = renderPoints[nearest.index];
        const alpha = behavior.walkerLinkAlpha * clamp(1 - Math.sqrt(nearest.distanceSq) / behavior.bridgeDistance, 0.08, 1);
        lines.push(
          '<line x1="' +
            round(walker.x) +
            '" y1="' +
            round(walker.y) +
            '" x2="' +
            round(point.x) +
            '" y2="' +
            round(point.y) +
            '" stroke="' +
            rgba(walkerStroke, alpha) +
            '" stroke-width="' +
            round(behavior.lineWidth * 0.8) +
            '" stroke-linecap="round"></line>'
        );
      });
    }

    if (behavior.showWalkers) {
      const walkerFill = rgba(mixColor(act.palette.line, "#111111", 0.52), behavior.walkerAlpha);
      state.walkers.forEach(function (walker) {
        dots.push(
          '<circle cx="' +
            round(walker.x) +
            '" cy="' +
            round(walker.y) +
            '" r="' +
            round(behavior.walkerSize) +
            '" fill="' +
            walkerFill +
            '"></circle>'
        );
      });
    }

    state.travelers.forEach(function (traveler) {
      const target = getTargetAt(state.travelTargets.length ? state.travelTargets : state.targets, traveler.targetIndex);
      const previous = getTargetAt(state.travelTargets.length ? state.travelTargets : state.targets, traveler.previousTargetIndex);
      const liveScale = 0.92 + 0.18 * Math.sin(state.phase * behavior.travelerPulseSpeed + traveler.pulse);
      const glowColor = rgba(mixColor(act.palette.glow, act.palette.secondary, 0.34), behavior.travelerGlowAlpha);
      const coreColor = rgba(mixColor(act.palette.primary, act.palette.secondary, 0.56), behavior.travelerDotAlpha);
      const edgeColor = rgba(mixColor(act.palette.glow, act.palette.spark, 0.18), Math.min(1, behavior.travelerDotAlpha * 0.8));

      if (behavior.travelerLineAlpha > 0 && target) {
        travelerLines.push(
          '<line x1="' +
            round(traveler.x) +
            '" y1="' +
            round(traveler.y) +
            '" x2="' +
            round(target.x) +
            '" y2="' +
            round(target.y) +
            '" stroke="' +
            rgba(mixColor(act.palette.secondary, act.palette.tertiary, 0.5), behavior.travelerLineAlpha) +
            '" stroke-width="' +
            round(behavior.travelerLineWidth) +
            '" stroke-linecap="round"></line>'
        );
      }

      if (behavior.travelerBridgeAlpha > 0 && previous && target) {
        travelerLines.push(
          '<line x1="' +
            round(previous.x) +
            '" y1="' +
            round(previous.y) +
            '" x2="' +
            round(traveler.x) +
            '" y2="' +
            round(traveler.y) +
            '" stroke="' +
            rgba(mixColor(act.palette.spark, act.palette.secondary, 0.38), behavior.travelerBridgeAlpha) +
            '" stroke-width="' +
            round(behavior.travelerLineWidth * 0.88) +
            '" stroke-linecap="round"></line>'
        );
      }

      travelerDots.push(
        '<circle cx="' +
          round(traveler.x) +
          '" cy="' +
          round(traveler.y) +
          '" r="' +
          round(traveler.size * behavior.travelerGlowScale * liveScale) +
          '" fill="' +
          glowColor +
          '"></circle>' +
          '<circle cx="' +
          round(traveler.x) +
          '" cy="' +
          round(traveler.y) +
          '" r="' +
          round(traveler.size * behavior.travelerDotScale * liveScale) +
          '" fill="' +
          coreColor +
          '" stroke="' +
          edgeColor +
          '" stroke-width="0.7"></circle>'
      );
    });

    state.links = links;
    refs.boidLines.innerHTML = lines.join("");
    refs.boidDots.innerHTML = dots.join("");
    refs.travelerLines.innerHTML = travelerLines.join("");
    refs.travelerDots.innerHTML = travelerDots.join("");
    updateStats();
  }

  function buildSeedTargets(targets, behavior) {
    const mesas = targets.filter(function (target) {
      return target.kind === "mesa";
    });
    const plates = targets.filter(function (target) {
      return target.kind === "plate";
    });

    if (behavior.seedMode === "plates") {
      return selectPlateSeedTargets(plates, behavior.seedPlatesPerMesa);
    }

    if (behavior.seedMode === "hybrid") {
      return mesas.concat(selectPlateSeedTargets(plates, behavior.seedPlatesPerMesa));
    }

    return mesas.length ? mesas : targets.slice(0, 1);
  }

  function selectPlateSeedTargets(plates, perMesa) {
    const groups = {};
    const result = [];

    plates.forEach(function (plate) {
      if (!groups[plate.mesaIndex]) {
        groups[plate.mesaIndex] = [];
      }
      groups[plate.mesaIndex].push(plate);
    });

    Object.keys(groups).forEach(function (key) {
      groups[key].slice(0, perMesa).forEach(function (plate) {
        result.push(plate);
      });
    });

    return result.length ? result : plates;
  }

  function updateWalker(walker, target, behavior, dt) {
    if (!target) return;

    walker.age += dt;
    const dx = target.x - walker.x;
    const dy = target.y - walker.y;
    const targetAngle = Math.atan2(dy, dx);
    const wander = (Math.random() - 0.5) * behavior.turnRate;
    const orbit = Math.sin(state.phase + walker.wobble) * behavior.orbit;

    walker.angle = mixAngles(walker.angle + wander + orbit, targetAngle, behavior.inwardPull);
    walker.x += Math.cos(walker.angle) * walker.speed * dt;
    walker.y += Math.sin(walker.angle) * walker.speed * dt;
  }

  function isWalkerOut(walker, target, behavior) {
    if (!target) return true;
    if (walker.x < -24 || walker.x > ARTBOARD.width + 24 || walker.y < -24 || walker.y > ARTBOARD.height + 24) {
      return true;
    }

    return distanceBetween(walker, target) > behavior.spawnRadiusMax * 1.45;
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

  function createChildBoid(walker, nearest, targets, behavior) {
    const parent = state.boids[nearest.index];
    const generation = parent.generation + 1;
    const size = Math.max(behavior.minNodeSize, behavior.nodeSize * Math.pow(behavior.childScale, generation));
    const dx = walker.x - parent.x;
    const dy = walker.y - parent.y;
    const distance = Math.hypot(dx, dy) || 1;
    const branchLength = behavior.stickDistance * (1.28 + Math.random() * 0.32);
    const stretch = Math.max(1, branchLength / distance);
    const x = clamp(parent.x + dx * stretch, 10, ARTBOARD.width - 10);
    const y = clamp(parent.y + dy * stretch, 10, ARTBOARD.height - 10);
    const node = {
      x: x,
      y: y,
      baseX: x,
      baseY: y,
      baseSize: size,
      targetIndex: walker.targetIndex,
      homeIndex: parent.homeIndex,
      homeMesaIndex: parent.homeMesaIndex,
      returning: false,
      age: 0,
      growth: 0,
      generation: generation,
      seedIndex: parent.seedIndex,
      tint: clamp(parent.tint + (Math.random() - 0.5) * 0.14 + 0.04, 0, 1),
      parentIndex: nearest.index,
      bridgeIndex: null,
      isSeed: false,
      pulse: Math.random() * Math.PI * 2,
    };

    if (nearest.alternateIndex !== null && Math.random() < behavior.bridgeChance) {
      const alternate = state.boids[nearest.alternateIndex];
      if (alternate && alternate.homeMesaIndex !== parent.homeMesaIndex) {
        node.bridgeIndex = nearest.alternateIndex;
      } else if (alternate && behavior.allowLocalBridge) {
        node.bridgeIndex = nearest.alternateIndex;
      }
    }

    return node;
  }

  function getRenderPoint(boid, behavior) {
    const pulse = boid.isSeed ? 0.3 : boid.growth;
    return {
      x: boid.x + Math.cos(state.phase * behavior.pulseSpeed + boid.pulse) * behavior.drift * pulse,
      y: boid.y + Math.sin(state.phase * behavior.pulseSpeed * 1.23 + boid.pulse) * behavior.drift * pulse,
    };
  }

  function distanceBetween(a, b) {
    return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
  }

  function getActivePlateAnchors() {
    const result = [];
    vectorData.plateGroups.forEach(function (group) {
      const ordered = BALANCED_PLATE_ORDER.map(function (position) {
        return group.plates[position];
      });

      ordered.slice(0, FIXED_PLATES_PER_MESA).forEach(function (plateIndex) {
        const anchor = vectorData.plateAnchors[plateIndex];
        result.push({
          x: anchor.cx || anchor.x,
          y: anchor.cy || anchor.y,
          kind: "plate",
          mesaIndex: group.mesaIndex,
          plateIndex: plateIndex,
        });
      });
    });
    return result;
  }

  function updateStats() {
    return;
  }

  function getAct() {
    return (
      acts.find(function (act) {
        return act.id === state.activeId;
      }) || acts[0]
    );
  }

  function applyTheme(act) {
    refs.artboard.dataset.act = act.id;
    document.documentElement.style.setProperty("--shell-bg-a", act.palette.bgStart);
    document.documentElement.style.setProperty("--shell-bg-b", act.palette.bgEnd);
    document.documentElement.style.setProperty("--accent", act.palette.secondary);
    document.documentElement.style.setProperty("--panel-line", rgba(act.palette.secondary, 0.18));
    document.documentElement.style.setProperty("--ambient-a", rgba(act.palette.glow, 0.96));
    document.documentElement.style.setProperty("--ambient-b", rgba(act.palette.primary, 0.4));
    document.documentElement.style.setProperty("--ambient-c", rgba(act.palette.secondary, 0.12));
    document.documentElement.style.setProperty("--art-glow-a", rgba(act.palette.glow, 0.88));
    document.documentElement.style.setProperty("--art-glow-b", rgba(act.palette.secondary, 0.18));
    document.documentElement.style.setProperty("--art-glow-c", rgba(act.palette.tertiary, 0.18));
  }

  function getTargetsForAct(actId, activePlates) {
    const mesas = buildMesaTargets();
    const plates = activePlates.map(copyTarget);
    const bridgeTargets = buildBridgeTargets(mesas);
    const focusedTargets = buildFocusedMesaTargets(mesas, 0.44, 0.5);
    const haloTargets = buildRingTargets(mesas, ARTBOARD.width * 0.12, ARTBOARD.height * 0.08, 6);
    let targets = mesas.concat(plates);

    if (actId === "utopia") {
      targets = mesas.concat(haloTargets);
    } else if (actId === "individuo") {
      targets = plates.length ? plates : mesas;
    } else if (actId === "redes") {
      targets = mesas.concat(bridgeTargets).concat(selectPlateSeedTargets(plates, 2));
    } else if (actId === "enxame") {
      targets = focusedTargets.concat(selectPlateSeedTargets(plates, 1));
    } else if (actId === "poiesis") {
      targets = plates.concat(bridgeTargets).concat(haloTargets.slice(0, 3));
    }

    return targets.map(function (target, index) {
      return Object.assign({ targetIndex: index }, target);
    });
  }

  function getTravelerTargetsForAct(actId, activePlates) {
    const mesas = buildMesaTargets();
    const plates = activePlates.map(copyTarget);
    const bridgeTargets = buildBridgeTargets(mesas);
    const focusedTargets = buildFocusedMesaTargets(mesas, 0.62, 0.7);
    const haloTargets = buildRingTargets(mesas, ARTBOARD.width * 0.15, ARTBOARD.height * 0.11, 8);
    let targets = mesas.concat(plates);

    if (actId === "utopia") {
      targets = mesas.concat(focusedTargets).concat(haloTargets);
    } else if (actId === "individuo") {
      targets = selectPlateSeedTargets(plates, 2);
    } else if (actId === "redes") {
      targets = mesas.concat(bridgeTargets).concat(focusedTargets).concat(selectPlateSeedTargets(plates, 1));
    } else if (actId === "enxame") {
      targets = focusedTargets.concat(bridgeTargets);
    } else if (actId === "poiesis") {
      targets = bridgeTargets.concat(haloTargets).concat(selectPlateSeedTargets(plates, 1));
    }

    return targets.map(function (target, index) {
      return Object.assign({ targetIndex: index }, target);
    });
  }

  function getActBehavior(act, motionNorm, densityNorm) {
    densityNorm = clamp(densityNorm, 0.25, 1);

    const profiles = {
      utopia: {
        maxNodes: 46 + Math.round(densityNorm * 58),
        walkerCount: 24 + Math.round(densityNorm * 18 + motionNorm * 10),
        spawnRate: 0.34 + densityNorm * 0.18,
        stickyChance: 0.14 + motionNorm * 0.02,
        stickDistance: 12.5 + motionNorm * 1.8,
        bridgeDistance: 118,
        bridgeChance: 0.18 + motionNorm * 0.05,
        spawnRadiusMin: 46,
        spawnRadiusMax: 142,
        speedMin: 1.02,
        speedMax: 1.68 + motionNorm * 0.34,
        turnRate: 0.24 + motionNorm * 0.16,
        inwardPull: 0.06 + motionNorm * 0.03,
        orbit: 0.052 + motionNorm * 0.024,
        walkerRetargetChance: 0.022 + motionNorm * 0.012,
        retargetDistance: 26,
        exchangeDelay: 14,
        nodeGrowthRate: 0.094,
        nodeSize: 2.36,
        seedSize: 4.9,
        minNodeSize: 1.05,
        childScale: 0.989,
        warmupBudget: 0.4,
        travelerCount: 7 + Math.round(densityNorm * 3),
        travelerSpeedMin: 0.82,
        travelerSpeedMax: 1.28 + motionNorm * 0.2,
        travelerSizeMin: 1.2,
        travelerSizeMax: 2.1,
        travelerSpawnRadiusMin: 8,
        travelerSpawnRadiusMax: 24,
        travelerPull: 0.018,
        travelerOrbit: 0.034,
        travelerJitter: 0.014,
        travelerDamping: 0.993,
        travelerMaxSpeed: 1.42 + motionNorm * 0.24,
        travelerArrivalRadius: 20,
        travelerRetargetChance: 0.004,
        travelerLegDuration: 90,
        travelerGlowAlpha: 0.24,
        travelerGlowScale: 2.8,
        travelerDotAlpha: 0.86,
        travelerDotScale: 0.96,
        travelerLineAlpha: 0.06,
        travelerBridgeAlpha: 0.04,
        travelerLineWidth: 0.88,
        travelerPulseSpeed: 0.85,
        lineMix: 0.5,
        lineAlpha: 0.16,
        bridgeAlpha: 0.12,
        lineWidth: 0.9,
        glowAlpha: 0.3,
        glowScale: 3.1,
        dotScale: 1.04,
        edgeAlpha: 0.28,
        coreMix: 0.4,
        walkerAlpha: 0.08,
        walkerSize: 1.08,
        showWalkers: true,
        showWalkerLinks: false,
        walkerLinkAlpha: 0,
        pulseSpeed: 0.82,
        drift: 1.6,
        shape: "circle",
        seedMode: "mesa",
        seedPlatesPerMesa: 0,
        spawnTargets: "mesa",
        allowLocalBridge: false,
        mode: "utopia",
        exchangeBias: 0.82,
      },
      individuo: {
        maxNodes: 86 + Math.round(densityNorm * 82),
        walkerCount: 18 + Math.round(densityNorm * 10 + motionNorm * 3),
        spawnRate: 0.36 + densityNorm * 0.2,
        stickyChance: 0.38 + motionNorm * 0.04,
        stickDistance: 10.6 + motionNorm * 0.8,
        bridgeDistance: 28,
        bridgeChance: 0.01,
        spawnRadiusMin: 14,
        spawnRadiusMax: 34,
        speedMin: 0.62,
        speedMax: 0.96 + motionNorm * 0.14,
        turnRate: 0.09 + motionNorm * 0.06,
        inwardPull: 0.18,
        orbit: 0.004,
        walkerRetargetChance: 0.001,
        retargetDistance: 12,
        exchangeDelay: 52,
        nodeGrowthRate: 0.086,
        nodeSize: 2.3,
        seedSize: 4.1,
        minNodeSize: 1.18,
        childScale: 0.986,
        warmupBudget: 0.7,
        travelerCount: 4 + Math.round(densityNorm * 1),
        travelerSpeedMin: 0.64,
        travelerSpeedMax: 0.88 + motionNorm * 0.12,
        travelerSizeMin: 1,
        travelerSizeMax: 1.7,
        travelerSpawnRadiusMin: 6,
        travelerSpawnRadiusMax: 18,
        travelerPull: 0.022,
        travelerOrbit: 0.006,
        travelerJitter: 0.008,
        travelerDamping: 0.995,
        travelerMaxSpeed: 0.98 + motionNorm * 0.14,
        travelerArrivalRadius: 12,
        travelerRetargetChance: 0.001,
        travelerLegDuration: 132,
        travelerGlowAlpha: 0.14,
        travelerGlowScale: 1.9,
        travelerDotAlpha: 0.78,
        travelerDotScale: 0.88,
        travelerLineAlpha: 0.03,
        travelerBridgeAlpha: 0.01,
        travelerLineWidth: 0.8,
        travelerPulseSpeed: 1.04,
        lineMix: 0.18,
        lineAlpha: 0.34,
        bridgeAlpha: 0.04,
        lineWidth: 1.08,
        glowAlpha: 0.24,
        glowScale: 2.3,
        dotScale: 1.18,
        edgeAlpha: 0.5,
        coreMix: 0.18,
        walkerAlpha: 0.04,
        walkerSize: 1,
        showWalkers: false,
        showWalkerLinks: false,
        walkerLinkAlpha: 0,
        pulseSpeed: 1.05,
        drift: 0.2,
        shape: "diamond",
        seedMode: "plates",
        seedPlatesPerMesa: 3,
        spawnTargets: "plate",
        allowLocalBridge: false,
        mode: "individuo",
        exchangeBias: 0.02,
      },
      redes: {
        maxNodes: 118 + Math.round(densityNorm * 118),
        walkerCount: 26 + Math.round(densityNorm * 18 + motionNorm * 10),
        spawnRate: 0.42 + densityNorm * 0.24,
        stickyChance: 0.22 + motionNorm * 0.05,
        stickDistance: 12.4 + motionNorm * 1.2,
        bridgeDistance: 146,
        bridgeChance: 0.42 + motionNorm * 0.1,
        spawnRadiusMin: 36,
        spawnRadiusMax: 122,
        speedMin: 1,
        speedMax: 1.48 + motionNorm * 0.34,
        turnRate: 0.18 + motionNorm * 0.14,
        inwardPull: 0.08,
        orbit: 0.018,
        walkerRetargetChance: 0.016,
        retargetDistance: 20,
        exchangeDelay: 18,
        nodeGrowthRate: 0.104,
        nodeSize: 2.06,
        seedSize: 4.3,
        minNodeSize: 1,
        childScale: 0.991,
        warmupBudget: 0.52,
        travelerCount: 8 + Math.round(densityNorm * 4),
        travelerSpeedMin: 1.02,
        travelerSpeedMax: 1.52 + motionNorm * 0.24,
        travelerSizeMin: 1.2,
        travelerSizeMax: 2.2,
        travelerSpawnRadiusMin: 8,
        travelerSpawnRadiusMax: 26,
        travelerPull: 0.024,
        travelerOrbit: 0.022,
        travelerJitter: 0.014,
        travelerDamping: 0.991,
        travelerMaxSpeed: 1.62 + motionNorm * 0.28,
        travelerArrivalRadius: 18,
        travelerRetargetChance: 0.014,
        travelerLegDuration: 64,
        travelerGlowAlpha: 0.18,
        travelerGlowScale: 2.12,
        travelerDotAlpha: 0.84,
        travelerDotScale: 0.9,
        travelerLineAlpha: 0.18,
        travelerBridgeAlpha: 0.12,
        travelerLineWidth: 0.94,
        travelerPulseSpeed: 1.18,
        lineMix: 0.55,
        lineAlpha: 0.38,
        bridgeAlpha: 0.24,
        lineWidth: 1.08,
        glowAlpha: 0.18,
        glowScale: 2.04,
        dotScale: 1.02,
        edgeAlpha: 0.38,
        coreMix: 0.3,
        walkerAlpha: 0.08,
        walkerSize: 1.05,
        showWalkers: true,
        showWalkerLinks: false,
        walkerLinkAlpha: 0,
        pulseSpeed: 1.12,
        drift: 0.54,
        shape: "circle",
        seedMode: "hybrid",
        seedPlatesPerMesa: 2,
        spawnTargets: "all",
        allowLocalBridge: false,
        mode: "redes",
        exchangeBias: 0.92,
      },
      enxame: {
        maxNodes: 62 + Math.round(densityNorm * 76),
        walkerCount: 24 + Math.round(densityNorm * 14 + motionNorm * 12),
        spawnRate: 0.3 + densityNorm * 0.24,
        stickyChance: 0.12 + motionNorm * 0.02,
        stickDistance: 10.5 + motionNorm * 0.8,
        bridgeDistance: 54,
        bridgeChance: 0.1,
        spawnRadiusMin: 16,
        spawnRadiusMax: 56,
        speedMin: 1.3,
        speedMax: 2 + motionNorm * 0.54,
        turnRate: 0.36 + motionNorm * 0.22,
        inwardPull: 0.08,
        orbit: 0,
        walkerRetargetChance: 0.05,
        retargetDistance: 12,
        exchangeDelay: 8,
        nodeGrowthRate: 0.12,
        nodeSize: 1.84,
        seedSize: 3.4,
        minNodeSize: 0.88,
        childScale: 0.992,
        warmupBudget: 0.28,
        travelerCount: 18 + Math.round(densityNorm * 10),
        travelerSpeedMin: 1.58,
        travelerSpeedMax: 2.28 + motionNorm * 0.38,
        travelerSizeMin: 1.08,
        travelerSizeMax: 1.86,
        travelerSpawnRadiusMin: 4,
        travelerSpawnRadiusMax: 16,
        travelerPull: 0.045,
        travelerOrbit: 0.004,
        travelerJitter: 0.038,
        travelerDamping: 0.986,
        travelerMaxSpeed: 2.6 + motionNorm * 0.42,
        travelerArrivalRadius: 14,
        travelerRetargetChance: 0.04,
        travelerLegDuration: 32,
        travelerGlowAlpha: 0.18,
        travelerGlowScale: 1.86,
        travelerDotAlpha: 0.92,
        travelerDotScale: 0.9,
        travelerLineAlpha: 0.14,
        travelerBridgeAlpha: 0.12,
        travelerLineWidth: 0.92,
        travelerPulseSpeed: 1.92,
        lineMix: 0.25,
        lineAlpha: 0.16,
        bridgeAlpha: 0.08,
        lineWidth: 0.8,
        glowAlpha: 0.12,
        glowScale: 1.5,
        dotScale: 0.9,
        edgeAlpha: 0.26,
        coreMix: 0.2,
        walkerAlpha: 0.12,
        walkerSize: 1.18,
        showWalkers: true,
        showWalkerLinks: false,
        walkerLinkAlpha: 0.08,
        pulseSpeed: 1.9,
        drift: 0.26,
        shape: "circle",
        seedMode: "hybrid",
        seedPlatesPerMesa: 1,
        spawnTargets: "plate",
        allowLocalBridge: true,
        mode: "enxame",
        exchangeBias: 0.92,
      },
      poiesis: {
        maxNodes: 92 + Math.round(densityNorm * 104),
        walkerCount: 20 + Math.round(densityNorm * 12 + motionNorm * 4),
        spawnRate: 0.34 + densityNorm * 0.18,
        stickyChance: 0.28 + motionNorm * 0.03,
        stickDistance: 12.8 + motionNorm * 1,
        bridgeDistance: 132,
        bridgeChance: 0.32 + motionNorm * 0.08,
        spawnRadiusMin: 24,
        spawnRadiusMax: 82,
        speedMin: 0.76,
        speedMax: 1.08 + motionNorm * 0.16,
        turnRate: 0.14 + motionNorm * 0.08,
        inwardPull: 0.14,
        orbit: 0.018,
        walkerRetargetChance: 0.004,
        retargetDistance: 14,
        exchangeDelay: 44,
        nodeGrowthRate: 0.078,
        nodeSize: 2.26,
        seedSize: 4.5,
        minNodeSize: 1.05,
        childScale: 0.986,
        warmupBudget: 0.58,
        travelerCount: 6 + Math.round(densityNorm * 3),
        travelerSpeedMin: 0.82,
        travelerSpeedMax: 1.12 + motionNorm * 0.14,
        travelerSizeMin: 1.08,
        travelerSizeMax: 1.9,
        travelerSpawnRadiusMin: 8,
        travelerSpawnRadiusMax: 22,
        travelerPull: 0.026,
        travelerOrbit: 0.022,
        travelerJitter: 0.008,
        travelerDamping: 0.994,
        travelerMaxSpeed: 1.18 + motionNorm * 0.16,
        travelerArrivalRadius: 16,
        travelerRetargetChance: 0.002,
        travelerLegDuration: 118,
        travelerGlowAlpha: 0.16,
        travelerGlowScale: 2,
        travelerDotAlpha: 0.82,
        travelerDotScale: 0.9,
        travelerLineAlpha: 0.08,
        travelerBridgeAlpha: 0.06,
        travelerLineWidth: 0.9,
        travelerPulseSpeed: 0.9,
        lineMix: 0.42,
        lineAlpha: 0.34,
        bridgeAlpha: 0.28,
        lineWidth: 1.08,
        glowAlpha: 0.18,
        glowScale: 1.9,
        dotScale: 1.06,
        edgeAlpha: 0.48,
        coreMix: 0.45,
        walkerAlpha: 0.06,
        walkerSize: 1,
        showWalkers: false,
        showWalkerLinks: false,
        walkerLinkAlpha: 0,
        pulseSpeed: 0.76,
        drift: 0.3,
        shape: "diamond",
        seedMode: "hybrid",
        seedPlatesPerMesa: 2,
        spawnTargets: "all",
        allowLocalBridge: true,
        mode: "poiesis",
        exchangeBias: 0.18,
      },
    };

    return profiles[act.id] || profiles.utopia;
  }

  function retargetBoid(boid, behavior, targets) {
    if (!targets.length) return;

    boid.targetIndex = selectNextTargetIndex(boid, behavior, targets);
    const nextTarget = getTargetAt(targets, boid.targetIndex);

    if (behavior.mode === "enxame" && nextTarget) {
      boid.homeIndex = boid.targetIndex;
      boid.homeMesaIndex = nextTarget.mesaIndex || boid.homeMesaIndex;
      return;
    }

    if (behavior.mode === "redes" && nextTarget && nextTarget.kind === "plate" && Math.random() < 0.16) {
      boid.homeIndex = boid.targetIndex;
      boid.homeMesaIndex = nextTarget.mesaIndex || boid.homeMesaIndex;
    }
  }

  function getTargetAt(targets, index) {
    return targets[index % Math.max(1, targets.length)];
  }

  function selectNextTargetIndex(boid, behavior, targets) {
    const current = getTargetAt(targets, boid.targetIndex) || getTargetAt(targets, boid.homeIndex);
    const currentMesaIndex = current ? current.mesaIndex : boid.homeMesaIndex;
    const sameMesa = [];
    const crossMesa = [];
    const mesaTargets = [];
    const plateTargets = [];

    targets.forEach(function (target, index) {
      if (index === boid.targetIndex) return;

      if (target.kind === "mesa") {
        mesaTargets.push(index);
      } else {
        plateTargets.push(index);
      }

      if (target.mesaIndex === currentMesaIndex) {
        sameMesa.push(index);
      } else {
        crossMesa.push(index);
      }
    });

    if (behavior.mode === "individuo") {
      const localPlates = sameMesa.filter(function (index) {
        return targets[index].kind === "plate";
      });
      return pickRandomIndex(localPlates.length ? localPlates : plateTargets, boid.homeIndex);
    }

    if (behavior.mode === "poiesis") {
      boid.returning = !boid.returning;
      if (boid.returning) {
        return boid.homeIndex;
      }
      const memoryPool = crossMesa.concat(mesaTargets);
      return pickRandomIndex(memoryPool.length ? memoryPool : plateTargets.concat(mesaTargets), boid.targetIndex);
    }

    if (behavior.mode === "redes") {
      const bridges = crossMesa.filter(function (index) {
        return targets[index].kind === "mesa";
      });
      const exchangePool = bridges.concat(crossMesa);
      const localPool = sameMesa.concat(mesaTargets);
      return pickRandomIndex(
        Math.random() < behavior.exchangeBias ? exchangePool : localPool,
        boid.targetIndex,
        localPool.concat(exchangePool)
      );
    }

    if (behavior.mode === "enxame") {
      const swarmPool =
        Math.random() < behavior.exchangeBias
          ? crossMesa.concat(mesaTargets).concat(plateTargets)
          : plateTargets.concat(sameMesa);
      return pickRandomIndex(swarmPool, boid.targetIndex, plateTargets.concat(mesaTargets));
    }

    if (behavior.mode === "utopia") {
      const haloPool = mesaTargets.concat(plateTargets);
      const pool = Math.random() < behavior.exchangeBias ? crossMesa.concat(haloPool) : sameMesa.concat(haloPool);
      return pickRandomIndex(pool, boid.targetIndex, haloPool);
    }

    return pickRandomIndex(plateTargets.concat(mesaTargets), boid.targetIndex);
  }

  function getSpawnTargetIndex(targets, behavior) {
    const mesaTargets = [];
    const plateTargets = [];

    targets.forEach(function (target, index) {
      if (target.kind === "mesa") {
        mesaTargets.push(index);
      } else if (target.kind === "plate") {
        plateTargets.push(index);
      }
    });

    if (behavior && behavior.spawnTargets === "mesa") {
      return pickRandomIndex(mesaTargets, 0, plateTargets);
    }

    if (behavior && behavior.spawnTargets === "plate") {
      return pickRandomIndex(plateTargets, 0, mesaTargets);
    }

    return pickRandomIndex(mesaTargets.concat(plateTargets), 0);
  }

  function pickRandomIndex(primary, fallbackIndex, secondary) {
    const pool = primary && primary.length ? primary : secondary && secondary.length ? secondary : [fallbackIndex || 0];
    return pool[Math.floor(Math.random() * pool.length)] || 0;
  }

  function buildMesaTargets() {
    return vectorData.mesaCenters.map(function (center, index) {
      return {
        x: center.cx || center.x,
        y: center.cy || center.y,
        kind: "mesa",
        mesaIndex: index,
      };
    });
  }

  function getLayoutCenter(points) {
    const list = points && points.length ? points : [{ x: ARTBOARD.width * 0.5, y: ARTBOARD.height * 0.5 }];
    const sum = list.reduce(
      function (acc, point) {
        acc.x += point.x;
        acc.y += point.y;
        return acc;
      },
      { x: 0, y: 0 }
    );

    return {
      x: sum.x / list.length,
      y: sum.y / list.length,
    };
  }

  function buildFocusedMesaTargets(mesas, pull, verticalPull) {
    const center = getLayoutCenter(mesas);
    return mesas.map(function (mesa) {
      return {
        x: lerp(mesa.x, center.x, pull),
        y: lerp(mesa.y, center.y, verticalPull),
        kind: "mesa",
        mesaIndex: mesa.mesaIndex,
      };
    });
  }

  function buildBridgeTargets(mesas) {
    const focused = buildFocusedMesaTargets(mesas, 0.5, 0.56);
    const center = getLayoutCenter(mesas);
    return focused.concat([
      {
        x: center.x,
        y: center.y,
        kind: "mesa",
        mesaIndex: mesas.length,
      },
    ]);
  }

  function buildRingTargets(mesas, radiusX, radiusY, count) {
    const center = getLayoutCenter(mesas);
    return Array.from({ length: count }, function (_, index) {
      const angle = (index / Math.max(1, count)) * Math.PI * 2 - Math.PI * 0.5;
      return {
        x: center.x + Math.cos(angle) * radiusX,
        y: center.y + Math.sin(angle) * radiusY,
        kind: "mesa",
        mesaIndex: mesas[index % Math.max(1, mesas.length)] ? mesas[index % mesas.length].mesaIndex : index,
      };
    });
  }

  function copyPoint(point) {
    return { x: point.cx || point.x, y: point.cy || point.y };
  }

  function copyTarget(point) {
    return {
      x: point.cx || point.x,
      y: point.cy || point.y,
      kind: point.kind || "plate",
      mesaIndex: point.mesaIndex || 0,
      plateIndex: point.plateIndex,
    };
  }

  function hexToRgb(color) {
    if (String(color).indexOf("rgb") === 0) {
      const values = String(color).match(/[\d.]+/g) || ["0", "0", "0"];
      return {
        r: Number(values[0] || 0),
        g: Number(values[1] || 0),
        b: Number(values[2] || 0),
      };
    }

    const hex = String(color).replace("#", "");
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
    return Math.round(value * 100) / 100;
  }
})();
