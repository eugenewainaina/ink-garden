import { SPECIES, founderGenome } from '@ink-garden/engine'
import { shootFor } from '../../../engine/src/dev/develop.ts'
import { sceneFromShoot } from '../../../engine/src/dev/geometry.ts'
import { writeFileSync } from 'node:fs'

/**
 * A page with a plant on it.
 *
 * The scene is serialised to JSON and drawn by about forty lines of inline
 * canvas code. That is deliberate: the browser imports no engine and no
 * renderer, because the `Scene` is the interchange format. If this page needed
 * the engine in the bundle, the seam would be a fiction.
 *
 * It is also the first time any of this has been looked at in a browser, which
 * is the only way to judge whether it reads on a phone.
 */

const args: Record<string, string> = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i] ?? ''
  if (token.startsWith('--')) args[token.slice(2)] = argv[i + 1] ?? 'true'
}

const chosen =
  args['species'] === undefined || args['species'] === 'all'
    ? SPECIES
    : SPECIES.filter((s) => s.id === args['species'])
if (chosen.length === 0) throw new Error('unknown species')

const width = Number.parseInt(args['width'] ?? '900', 10)
const detail = Math.max(0.66, Math.min(1, 0.5 + (width / 1000) * 0.5))

const panels = chosen.map((species) => {
  const genome = founderGenome(species, args['seed'] ?? 'page')
  const { shoot, phenotype, seed } = shootFor(genome, species, args['stage'] ?? 'bloom')
  const scene = sceneFromShoot(shoot, phenotype, species, seed, { detail })
  return { name: species.commonName, scene }
})

// Coordinates are rounded before serialising. The scene is in centimetres and
// a phone screen shows a whole plant in about four hundred pixels, so a third
// decimal place is a thousandth of a pixel: pure payload. This is the cheapest
// size lever on the wire, and the scene is the wire format.
const round = (value: number): number => Math.round(value * 100) / 100
const payload = JSON.stringify({
  seed: args['seed'] ?? 'page',
  panels: panels.map((panel) => ({
    name: panel.name,
    scene: {
      ...panel.scene,
      minX: round(panel.scene.minX),
      minY: round(panel.scene.minY),
      maxX: round(panel.scene.maxX),
      maxY: round(panel.scene.maxY),
      shapes: panel.scene.shapes.map((shape) => ({
        ...shape,
        points: shape.points.map((point) => ({ x: round(point.x), y: round(point.y) })),
        strokeWidth: shape.strokeWidth === undefined ? undefined : round(shape.strokeWidth),
      })),
    },
  })),
})

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ink Garden</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f2eee4;
    font: 15px/1.5 ui-serif, Georgia, serif;
    color: #3a3226;
  }
  .sheet { max-width: ${width}px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 17px; font-weight: 600; margin: 8px 0 2px; }
  p.sub { margin: 0 0 16px; opacity: 0.65; font-size: 13px; }
  .panel { margin-bottom: 22px; }
  .panel h2 { font-size: 15px; font-weight: 600; margin: 0 0 6px; }
  .panel em { font-style: italic; opacity: 0.6; font-weight: 400; }
  canvas {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid #e2dccd;
    border-radius: 3px;
    background: #faf7ef;
  }
  .meta { font-size: 12px; opacity: 0.55; margin-top: 4px; }
</style>
</head>
<body>
<div class="sheet">
  <h1>Ink Garden</h1>
  <p class="sub">Drawn from the genome. No image loaded; the scene below is geometry.</p>
  <div id="root"></div>
</div>
<script id="scene" type="application/json">${payload}</script>
<script>
(function () {
  var data = JSON.parse(document.getElementById('scene').textContent);
  var root = document.getElementById('root');

  function paperRng(seed) {
    var state = 2166136261;
    for (var i = 0; i < seed.length; i++) { state ^= seed.charCodeAt(i); state = Math.imul(state, 16777619); }
    return function () {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return ((state >>> 0) % 100000) / 100000;
    };
  }

  function draw(canvas, scene, seed) {
    var padding = 14;
    var ratio = Math.min(3, window.devicePixelRatio || 1);
    var spanX = Math.max(1e-6, scene.maxX - scene.minX);
    var spanY = Math.max(1e-6, scene.maxY - scene.minY);
    var aspect = (spanY + padding * 2) / (spanX + padding * 2);

    // The backing store is sized in CSS PIXELS, not in plant units.
    //
    // The first version set canvas.width to the drawing's width in centimetres,
    // which for a rosemary is about twenty, and then let CSS stretch it to the
    // column. Twenty pixels of backing store blown up to four hundred is why
    // every plant came out as a blur: it was a thumbnail scaled up, not a
    // drawing. This measures the box the browser has given the element and
    // sizes the store to match.
    var cssWidth = canvas.parentNode.clientWidth || 320;
    var cssHeight = Math.round(cssWidth * aspect);
    var w = cssWidth;
    var h = cssHeight;
    // One plant unit to one CSS pixel at the natural size, scaled up to fill.
    var scale = (cssWidth - padding * 2) / spanX;

    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.aspectRatio = w + ' / ' + h;
    var ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    var toX = function (x) { return (x - scene.minX) * scale + padding; };
    var toY = function (y) { return h - padding - (y - scene.minY) * scale; };

    ctx.fillStyle = '#faf7ef';
    ctx.fillRect(0, 0, w, h);

    var random = paperRng(seed);
    var flecks = Math.round((w * h) / (140 * 140) * 92);
    for (var i = 0; i < flecks; i++) {
      var fx = random() * w, fy = random() * h, fr = 0.2 + random() * 0.5;
      var shade = 0.55 + random() * 0.35;
      ctx.fillStyle = 'rgba(' + Math.round(200 * shade) + ',' + Math.round(150 * shade) + ',' + Math.round(70 * shade) + ',' + (0.5 + random() * 0.5).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill();
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (var s = 0; s < scene.shapes.length; s++) {
      var shape = scene.shapes[s];
      ctx.beginPath();
      for (var p = 0; p < shape.points.length; p++) {
        var pt = shape.points[p];
        if (p === 0) ctx.moveTo(toX(pt.x), toY(pt.y)); else ctx.lineTo(toX(pt.x), toY(pt.y));
      }
      if (shape.closed !== false) ctx.closePath();
      if (shape.fill !== 'none') { ctx.fillStyle = shape.fill; ctx.fill(); }
      if (shape.stroke !== undefined) {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = (shape.strokeWidth || 0.05) * scale;
        ctx.stroke();
      }
    }
  }

  data.panels.forEach(function (panel) {
    var wrap = document.createElement('div');
    wrap.className = 'panel';
    var heading = document.createElement('h2');
    heading.textContent = panel.name;
    var canvas = document.createElement('canvas');
    var meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = panel.scene.shapes.length + ' marks';
    wrap.appendChild(heading);
    wrap.appendChild(canvas);
    wrap.appendChild(meta);
    root.appendChild(wrap);
    // The scene is in plant units, so the canvas is sized to the drawing and
    // CSS scales it to the column.
    draw(canvas, panel.scene, data.seed + '|' + panel.name);
  });

  window.__GARDEN_READY__ = true;
  window.__GARDEN_MARKS__ = data.panels.reduce(function (n, p) { return n + p.scene.shapes.length; }, 0);
})();
</script>
</body>
</html>
`

const out = args['out'] ?? '/tmp/garden.html'
writeFileSync(out, html)
console.log(`  wrote ${out}: ${panels.length} panels, ${panels.reduce((n, p) => n + p.scene.shapes.length, 0)} marks`)
