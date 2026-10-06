/* A quiet, articulated portrait from one still image. No video or extra requests. */
(() => {
  'use strict';

  const COLS = 40;
  const ROWS = 50;
  const FRAME_MS = 1000 / 30;
  const IDLE_MS = 6200;
  const EASE_OUT_MS = 850;
  const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

  // Coordinates are image coordinates: left/top is (0, 0). Offsets are CSS pixels.
  // The face is pinned. A flat inner weight keeps each pill/palm locally rigid;
  // its soft outer weight carries the gesture through the sleeve without seams.
  function portraitOffset(x, y, seconds, selected, selection, strength) {
    function smooth(a, b, value) {
      const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }
    function handWeight(center) {
      const horizontal = (x - center) / 0.115;
      const vertical = (y - 0.80) / 0.078;
      return 1 - smooth(0.82, 2.45, Math.sqrt(horizontal * horizontal + vertical * vertical));
    }
    const torsoGate = smooth(0.36, 0.47, y);
    const torsoX = (x - 0.5) / 0.27;
    const torsoY = (y - 0.59) / 0.21;
    const torso = Math.exp(-(torsoX * torsoX + torsoY * torsoY)) * torsoGate;
    const breath = Math.sin(seconds * 1.28);
    let dx = (x - 0.5) * 2.0 * breath * torso * strength;
    let dy = -0.62 * breath * torso * strength;
    const left = handWeight(0.223) * torsoGate;
    const right = handWeight(0.779) * torsoGate;
    dx += (0.60 * Math.sin(seconds * 1.05 + 0.45) * left
      - 0.60 * Math.sin(seconds * 0.98 + 1.8) * right) * strength;
    dy += (1.38 * Math.sin(seconds * 1.05 + 0.45) * left
      + 1.38 * Math.sin(seconds * 0.98 + 1.8) * right) * strength;
    if (selection > 0) {
      const hand = selected === 'team' ? right : left;
      // A small, continuous forward/up gesture; the idle pose settles first.
      dx += (selected === 'team' ? 1.7 : -1.7) * hand * selection;
      dy -= 6.0 * hand * selection;
    }
    const edge = smooth(0, 0.035, x) * smooth(0, 0.035, 1 - x)
      * smooth(0, 0.035, y) * smooth(0, 0.035, 1 - y);
    return [dx * edge, dy * edge];
  }

  function initPortrait(canvas) {
    const portrait = canvas.closest('[data-portrait-stage]')
      || canvas.closest('[data-entry-stage]') || canvas.parentElement;
    const scene = canvas.closest('[data-entry-stage]') || portrait;
    const still = portrait && portrait.querySelector('img[data-entry-person]');
    if (!portrait || !still) return;

    const reduced = window.matchMedia(REDUCED_QUERY);
    let gl = null;
    let program = null;
    let verticesBuffer = null;
    let indicesBuffer = null;
    let texture = null;
    let vertices = null;
    let indices = null;
    let imageWidth = 0;
    let imageHeight = 0;
    let boxWidth = 0;
    let boxHeight = 0;
    let drawWidth = 0;
    let drawHeight = 0;
    let offsetX = 0;
    let offsetY = 0;
    let initialized = false;
    let ready = false;
    let failed = false;
    let visible = true;
    let suspended = false;
    let disposed = false;
    let raf = 0;
    let lastFrame = -Infinity;
    let awakeAt = 0;
    let deadline = 0;
    let choosingAt = -1;
    let choice = 'personal';

    const vertexSource = `
      attribute vec2 aPosition;
      attribute vec2 aUv;
      varying vec2 vUv;
      void main() {
        vUv = aUv;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision mediump float;
      varying vec2 vUv;
      uniform sampler2D uPortrait;
      void main() {
        gl_FragColor = texture2D(uPortrait, vUv);
      }
    `;

    function staticPortrait(state) {
      canvas.hidden = true;
      still.hidden = false;
      portrait.dataset.motionState = state;
      delete portrait.dataset.motionReady;
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function releaseResources() {
      if (!gl || gl.isContextLost()) return;
      if (texture) gl.deleteTexture(texture);
      if (verticesBuffer) gl.deleteBuffer(verticesBuffer);
      if (indicesBuffer) gl.deleteBuffer(indicesBuffer);
      if (program) gl.deleteProgram(program);
      texture = verticesBuffer = indicesBuffer = program = null;
    }

    function fail() {
      stop();
      ready = initialized = false;
      failed = true;
      staticPortrait('unavailable');
      releaseResources();
    }

    function compile(type, source) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Portrait shader unavailable');
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        throw new Error('Portrait shader could not compile');
      }
      return shader;
    }

    function createRenderer() {
      if (disposed || failed || reduced.matches || !still.naturalWidth) return false;
      gl = canvas.getContext('webgl', {
        alpha: true, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: true, preserveDrawingBuffer: false,
        powerPreference: 'low-power'
      });
      if (!gl) { fail(); return false; }
      const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
      let fragmentShader;
      try { fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource); }
      catch (error) { gl.deleteShader(vertexShader); throw error; }
      program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Portrait link failed');
      gl.useProgram(program);

      // Interleaved clip position and immutable image UVs.
      vertices = new Float32Array((COLS + 1) * (ROWS + 1) * 4);
      let index = 0;
      for (let row = 0; row <= ROWS; row++) {
        for (let col = 0; col <= COLS; col++) {
          vertices[index + 2] = col / COLS;
          vertices[index + 3] = row / ROWS;
          index += 4;
        }
      }
      indices = new Uint16Array(COLS * ROWS * 6);
      index = 0;
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const a = row * (COLS + 1) + col;
          const b = a + 1;
          const c = a + COLS + 1;
          indices[index++] = a; indices[index++] = c; indices[index++] = b;
          indices[index++] = b; indices[index++] = c; indices[index++] = c + 1;
        }
      }
      verticesBuffer = gl.createBuffer();
      indicesBuffer = gl.createBuffer();
      texture = gl.createTexture();
      if (!verticesBuffer || !indicesBuffer || !texture) throw new Error('Portrait allocation failed');
      gl.bindBuffer(gl.ARRAY_BUFFER, verticesBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indicesBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'aPosition');
      const uv = gl.getAttribLocation(program, 'aUv');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(uv);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(gl.getUniformLocation(program, 'uPortrait'), 0);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      initialized = true;
      return true;
    }

    function fit() {
      const bounds = portrait.getBoundingClientRect();
      if (!(bounds.width > 0 && bounds.height > 0 && imageWidth && imageHeight)) return false;
      boxWidth = bounds.width;
      boxHeight = bounds.height;
      const density = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(boxWidth * density));
      const height = Math.max(1, Math.round(boxHeight * density));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width; canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
      drawWidth = imageWidth * scale;
      drawHeight = imageHeight * scale;
      offsetX = (boxWidth - drawWidth) / 2;
      offsetY = (boxHeight - drawHeight) / 2;
      return true;
    }

    function draw(seconds, strength, selection) {
      if (!initialized || !drawWidth || gl.isContextLost()) return false;
      for (let index = 0; index < vertices.length; index += 4) {
        const x = vertices[index + 2];
        const y = vertices[index + 3];
        const motion = portraitOffset(x, y, seconds, choice, selection, strength);
        vertices[index] = ((offsetX + x * drawWidth + motion[0]) / boxWidth) * 2 - 1;
        vertices[index + 1] = 1 - ((offsetY + y * drawHeight + motion[1]) / boxHeight) * 2;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, verticesBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      return true;
    }

    function canAnimate() {
      return ready && !disposed && !failed && !suspended && !document.hidden
        && visible && !reduced.matches;
    }

    function frame(now) {
      raf = 0;
      if (!canAnimate()) return;
      if (now - lastFrame < FRAME_MS) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastFrame = now;
      const age = Math.max(0, now - awakeAt);
      const intro = Math.min(1, age / 520);
      let strength = intro * intro * (3 - 2 * intro);
      let selection = 0;
      let finished = false;
      if (choosingAt >= 0) {
        const t = Math.min(1, Math.max(0, (now - choosingAt) / 660));
        selection = 1 - Math.pow(1 - t, 3);
        strength *= 1 - selection;
        finished = t === 1;
      } else {
        const fade = Math.min(1, Math.max(0, (deadline - now) / EASE_OUT_MS));
        strength *= fade * fade * (3 - 2 * fade);
        finished = now >= deadline;
      }
      try {
        if (!draw(now / 1000, strength, selection)) return;
      } catch (error) { fail(); return; }
      if (finished) {
        portrait.dataset.motionState = choosingAt >= 0 ? 'selected' : 'settled';
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function wake() {
      if (!canAnimate()) return;
      const now = performance.now();
      if (!raf) {
        awakeAt = now;
        lastFrame = -Infinity;
        raf = requestAnimationFrame(frame);
      }
      deadline = now + IDLE_MS;
      portrait.dataset.motionState = 'active';
    }

    function syncScene() {
      const selecting = scene.dataset.scenePhase === 'choosing'
        || scene.dataset.scenePhase === 'revealing';
      const selected = scene.dataset.choice === 'team' ? 'team' : 'personal';
      if (selecting && (choosingAt < 0 || choice !== selected)) {
        choice = selected;
        choosingAt = performance.now();
        wake();
      } else if (!selecting && choosingAt >= 0) {
        choosingAt = -1;
        wake();
      }
    }

    function uploadStill() {
      if (disposed || reduced.matches || !still.complete || !still.naturalWidth) return;
      try {
        if (!initialized && !createRenderer()) return;
        imageWidth = still.naturalWidth;
        imageHeight = still.naturalHeight;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Top-down UVs match the HTML image. Premultiplied upload prevents dark
        // fringes around the transparent cutout, including its moving hands.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, still);
        if (gl.getError() !== gl.NO_ERROR) throw new Error('Portrait texture unavailable');
        // A hidden/unsized stage can become visible later through ResizeObserver.
        // Keep its still intact until there is a nonzero drawing surface.
        if (!fit()) return;
        if (!draw(0, 0, 0) || gl.getError() !== gl.NO_ERROR) throw new Error('Portrait not ready');
        ready = true;
        canvas.hidden = false;
        still.hidden = true;
        portrait.dataset.motionReady = 'true';
        syncScene();
        wake();
      } catch (error) { fail(); }
    }

    function resize() {
      if (reduced.matches || disposed) return;
      if (!ready) { uploadStill(); return; }
      try {
        if (!fit()) return;
        draw(0, 0, choosingAt >= 0 ? 1 : 0);
        wake();
      } catch (error) { fail(); }
    }

    function motionPreference() {
      stop();
      if (reduced.matches) {
        staticPortrait('static');
      } else if (ready) {
        canvas.hidden = false;
        still.hidden = true;
        portrait.dataset.motionReady = 'true';
        resize();
      } else {
        uploadStill();
      }
    }

    function visibilityChange() {
      if (document.hidden) {
        stop();
        if (ready) portrait.dataset.motionState = 'paused';
      } else {
        wake();
      }
    }

    function contextLost(event) {
      event.preventDefault();
      stop();
      ready = initialized = false;
      program = verticesBuffer = indicesBuffer = texture = null;
      staticPortrait('unavailable');
    }

    function contextRestored() {
      failed = false;
      uploadStill();
    }

    function onPageHide(event) {
      suspended = true;
      stop();
      if (!event.persisted) dispose();
    }

    function onPageShow() {
      suspended = false;
      wake();
    }

    const mutation = new MutationObserver(syncScene);
    mutation.observe(scene, { attributes: true, attributeFilter: ['data-scene-phase', 'data-choice'] });
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    if (resizeObserver) resizeObserver.observe(portrait);
    const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) wake(); else stop();
    }, { threshold: 0 }) : null;
    if (intersection) intersection.observe(portrait);

    function dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      mutation.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      if (intersection) intersection.disconnect();
      still.removeEventListener('load', uploadStill);
      still.removeEventListener('error', fail);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      scene.removeEventListener('pointerenter', wake);
      scene.removeEventListener('pointermove', wake);
      scene.removeEventListener('focusin', wake);
      document.removeEventListener('visibilitychange', visibilityChange);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      if (reduced.removeEventListener) reduced.removeEventListener('change', motionPreference);
      else reduced.removeListener(motionPreference);
      releaseResources();
    }

    still.addEventListener('load', uploadStill);
    still.addEventListener('error', fail);
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('webglcontextrestored', contextRestored);
    scene.addEventListener('pointerenter', wake, { passive: true });
    scene.addEventListener('pointermove', wake, { passive: true });
    scene.addEventListener('focusin', wake);
    document.addEventListener('visibilitychange', visibilityChange);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    if (reduced.addEventListener) reduced.addEventListener('change', motionPreference);
    else reduced.addListener(motionPreference);
    if (reduced.matches) staticPortrait('static');
    else if (still.complete && still.naturalWidth) uploadStill();
  }

  function start() {
    document.querySelectorAll('canvas[data-portrait-motion]').forEach(initPortrait);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
