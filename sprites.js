/* Coordinates below refer to pixels in RetroBowl_texture_2.webp. */
window.RetroSprites = (() => {
  const atlas = new Image();
  const atlasReady = new Promise((resolve, reject) => {
    atlas.onload = resolve;
    atlas.onerror = () => reject(new Error('Could not load the character atlas'));
  });
  atlas.src = '/rb/shared/RetroBowl_texture_2.webp';

  const cache = new Map();
  const runnerFrames = [
    { x: 2024, y: 297, width: 13, height: 21 },
    { x: 2024, y: 320, width: 13, height: 19 }
  ];

  function rgb(value, fallback) {
    const color = /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
    return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  }

  function colorsFor(uniform = {}) {
    return {
      helmet: rgb(uniform.helmet, '#ffffff'),
      shirt: rgb(uniform.shirt || uniform.uniform, '#9b2743'),
      sleeve: rgb(uniform.sleeve, '#ffffff'),
      pants: rgb(uniform.pants, '#ffffff'),
      stripe: rgb(uniform.stripe, '#ffffff'),
      socks: rgb(uniform.socks1, '#e6e6e6')
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
    const frame = kind === 'portrait'
      ? { x: 909 + 31 * index, y: 701, width: 29, height: 37 }
      : runnerFrames[index];
    const colors = colorsFor(uniform);
    const key = `${kind}:${index}:${JSON.stringify(colors)}`;
    if (cache.has(key)) return cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = kind === 'runner' ? 21 : frame.height;
    const entry = { canvas, ready: false };
    entry.promise = atlasReady.then(() => {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingEnabled = false;
      context.drawImage(atlas, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
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

  function drawRunner(context, x, y, pixelSize, uniform, frameIndex) {
    const entry = sprite('runner', frameIndex % runnerFrames.length, uniform);
    if (entry.ready) context.drawImage(entry.canvas, x, y, entry.canvas.width * pixelSize, entry.canvas.height * pixelSize);
  }

  return { atlas, paintPortrait, drawRunner };
})();
