/* The PNG files keep their original placeholder colors for uniform recoloring. */
window.RetroSprites = (() => {
  const images = new Map();
  const cache = new Map();
  const runnerFrames = [
    '/images/running/run_01.png',
    '/images/running/run_02.png',
    '/images/running/run_03.png',
    '/images/running/run_04.png',
    '/images/running/run_05.png',
    '/images/running/run_06.png'
  ];

  function loadImage(src) {
    if (images.has(src)) return images.get(src);
    const image = new Image();
    const ready = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    });
    ready.catch(error => console.error(error));
    const entry = { image, ready };
    images.set(src, entry);
    image.src = src;
    return entry;
  }

  const fieldImage = loadImage('/images/field.png').image;
  const footballImage = loadImage('/images/ball.png').image;
  const prePlayFrames = { lineman: '/images/pre_play/lineman.png', center: '/images/pre_play/center.png', skill: '/images/pre_play/skill.png' };
  const actionFrames = { dropback: ['/images/actions/dropback.png', '/images/actions/dropback1.png'], pass: ['/images/actions/pass.png', '/images/actions/pass1.png'] };
  Object.values(prePlayFrames).forEach(loadImage);
  Object.values(actionFrames).flat().forEach(loadImage);
  runnerFrames.forEach(loadImage);

  function rgb(value, part) {
    if (!/^#[0-9a-f]{6}$/i.test(value || '')) throw new Error(`Missing or invalid uniform color: ${part}`);
    return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
  }

  function colorsFor(uniform = {}) {
    return {
      helmet: rgb(uniform.helmet, 'helmet'),
      shirt: rgb(uniform.shirt, 'shirt'),
      sleeve: rgb(uniform.sleeve, 'sleeve'),
      pants: rgb(uniform.pants, 'pants'),
      stripe: rgb(uniform.stripe, 'stripe'),
      socks: rgb(uniform.socks1, 'socks1')
    };
  }

  function tint(color, factor, highlight = 0) {
    return color.map(channel => Math.round(Math.min(255, channel * factor * (1 - highlight) + 255 * highlight)));
  }

  function recolor(pixels, width, kind, colors) {
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      if (!pixels[i + 3]) continue;
      let replacement;
      if (kind === 'portrait') {
        const y = Math.floor(i / 4 / width);
        if (r === 0 && g === 255 && b === 0) replacement = colors.shirt;
        else if (r === 255 && g === 0 && b === 255) replacement = y >= 31 ? colors.pants : colors.sleeve;
        else if (r === 255 && g === 0 && b === 0) replacement = colors.stripe;
      } else {
        if (g === 0 && b === 0 && (r === 255 || r === 128)) replacement = tint(colors.helmet, r / 255);
        else if (r === 0 && g === 0 && (b === 255 || b === 128)) replacement = tint(colors.shirt, b / 255);
        else if (r === 128 && g === 128 && b === 255) replacement = tint(colors.shirt, 1, 0.4);
        else if (g === 0 && r === b && (r === 255 || r === 128)) replacement = tint(colors.pants, r / 255);
        else if (b === 0 && ((r === g && r === 255) || (r === 0 && (g === 255 || g === 127)))) replacement = tint(colors.socks, g / 255);
      }
      if (replacement) {
        pixels[i] = replacement[0];
        pixels[i + 1] = replacement[1];
        pixels[i + 2] = replacement[2];
      }
    }
  }

  function sprite(kind, index, uniform) {
    const source = kind === 'portrait'
      ? `/images/portraits/portrait_${String(index).padStart(2, '0')}.png`
      : kind === 'runner' ? runnerFrames[index] : actionFrames[kind] ? actionFrames[kind][index] : prePlayFrames[kind];
    const sourceImage = loadImage(source);
    const colors = colorsFor(uniform);
    const key = `${kind}:${index}:${JSON.stringify(colors)}`;
    if (cache.has(key)) return cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = kind === 'portrait' ? 29 : 16;
    canvas.height = kind === 'portrait' ? 37 : kind === 'runner' || actionFrames[kind] ? 17 : 16;
    const entry = { canvas, ready: false };
    entry.promise = sourceImage.ready.then(() => {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingEnabled = false;
      if (actionFrames[kind]) context.drawImage(sourceImage.image, 0, 0);
      else context.drawImage(sourceImage.image, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      recolor(image.data, canvas.width, kind, colors);
      context.putImageData(image, 0, 0);
      entry.ready = true;
    });
    entry.promise.catch(error => console.error(error));
    cache.set(key, entry);
    return entry;
  }

  function paintPortrait(canvas, index, uniform) {
    const frameIndex = Number.isInteger(index) ? Math.max(0, Math.min(9, index)) : 0;
    const entry = sprite('portrait', frameIndex, uniform);
    return entry.promise.then(() => {
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(entry.canvas, 0, 0);
    });
  }

  function drawRunner(context, x, y, pixelSize, uniform, frameIndex, flip = false) {
    const entry = sprite('runner', frameIndex % runnerFrames.length, uniform);
    if (!entry.ready) return;
    const width = entry.canvas.width * pixelSize;
    const height = entry.canvas.height * pixelSize;
    if (flip) {
      context.save();
      context.translate(x + width, y);
      context.scale(-1, 1);
      context.drawImage(entry.canvas, 0, 0, width, height);
      context.restore();
    } else context.drawImage(entry.canvas, x, y, width, height);
  }

  function drawPrePlay(context, x, y, pixelSize, uniform, kind, flip = false) {
    const entry = sprite(kind, 0, uniform);
    if (!entry.ready) return;
    const width = entry.canvas.width * pixelSize;
    const height = entry.canvas.height * pixelSize;
    if (flip) {
      context.save();
      context.translate(x + width, y);
      context.scale(-1, 1);
      context.drawImage(entry.canvas, 0, 0, width, height);
      context.restore();
    } else context.drawImage(entry.canvas, x, y, width, height);
  }

  function drawAction(context, x, y, pixelSize, uniform, kind, frameIndex) {
    const entry = sprite(kind, frameIndex % actionFrames[kind].length, uniform);
    if (entry.ready) context.drawImage(entry.canvas, x, y, entry.canvas.width * pixelSize, entry.canvas.height * pixelSize);
  }

  return { fieldImage, footballImage, paintPortrait, drawRunner, drawPrePlay, drawAction };
})();
