#!/usr/bin/env node
/**
 * build-geo-map.mjs — genera el fragmento HTML+CSS de un geo-map para el editor Canvas.
 *
 * El pipeline es 100% local y corre ANTES de publicar:
 *
 *   1. Fetch a Overpass API (calles y, opcionalmente, landuse/place).
 *   2. Proyección equirectangular lat/lng → unidades de canvas.
 *   3. Simplificación Ramer-Douglas-Peucker de las calles.
 *   4. Generación del <svg> con todos los atributos data-ocd-geo-* ya puestos
 *      (incluidos data-ocd-geo-places, data-ocd-geo-categories y
 *      data-ocd-geo-data-bounds como JSON válido) + CSS con
 *      vector-effect: non-scaling-stroke y .zoom-constant.
 *
 * Uso recomendado (archivo de configuración):
 *   node scripts/build-geo-map.mjs config/geo-map.json
 *
 * O por flags:
 *   node scripts/build-geo-map.mjs \
 *     --south=-38.76 --west=-72.63 --north=-38.72 --east=-72.56 \
 *     --lat=-38.7396 --lng=-72.5904 --scale=10 --places=places.json
 *
 * Salida:
 *   <out-dir>/<name>.fragment.html  → pegar tal cual en el textarea HTML del
 *                                     editor (el <style> se separa al importar).
 *   <out-dir>/<name>.css            → alternativa para el textarea CSS del editor.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

function printUsage() {
  console.log(`Uso:
  node scripts/build-geo-map.mjs <config.json> [flags]
  node scripts/build-geo-map.mjs --south=<s> --west=<w> --north=<n> --east=<e> --lat=<lat> --lng=<lng> --scale=<n> --places=<file> [--out-dir=<dir>]

Config JSON mínimo:
  {
    "name": "mi-proyecto",
    "project": { "lat": -38.7396, "lng": -72.5904 },
    "bbox": { "south": -38.76, "west": -72.63, "north": -38.72, "east": -72.56 },
    "scale": 10,
    "placesFile": "mi-proyecto-places.json"
  }

Archivo de lugares:
  {
    "categories": { "salud": "Salud", "educacion": "Educación" },
    "places": [
      { "nombre": "Hospital", "categoria": "salud", "lat": -38.74, "lng": -72.59, "dist": 1.2, "contacto": "+56 9 1234 5678" }
    ]
  }

Flags que sobrescriben la config: --south, --west, --north, --east, --lat, --lng,
--scale, --places, --out-dir, --name.`);
}

function fail(message) {
  console.error('ERROR: ' + message);
  process.exit(1);
}

function toNumber(raw, label) {
  const n = Number(raw);
  if (!Number.isFinite(n)) fail(label + ' debe ser un número (recibido: ' + JSON.stringify(raw) + ').');
  return n;
}

function readJson(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    fail('No se pudo leer ' + path + ': ' + error.message);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(path + ' no es JSON válido: ' + error.message);
  }
}

function resolveFrom(baseDir, value) {
  if (value == null || value === '') return value;
  if (typeof value !== 'string') return value;
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/')) return value;
  return resolve(baseDir, value);
}

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      name: { type: 'string' },
      south: { type: 'string' },
      west: { type: 'string' },
      north: { type: 'string' },
      east: { type: 'string' },
      lat: { type: 'string' },
      lng: { type: 'string' },
      scale: { type: 'string' },
      places: { type: 'string' },
      'out-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h' }
    }
  });
  return { values, positionals };
}

function loadConfig(cli) {
  const configPath = cli.positionals[0] || cli.values.config || null;
  let base = {};
  let configDir = process.cwd();

  if (configPath) {
    const resolvedConfigPath = resolve(process.cwd(), configPath);
    base = readJson(resolvedConfigPath);
    configDir = dirname(resolvedConfigPath);
  }

  const cfg = {
    name: cli.values.name || base.name || 'geo-map',
    project: base.project || {},
    bbox: base.bbox || {},
    scale: cli.values.scale != null ? toNumber(cli.values.scale, '--scale') : (base.scale != null ? toNumber(base.scale, 'scale') : 10),
    padding: base.padding != null ? toNumber(base.padding, 'padding') : 24,
    accentColor: base.accentColor || '#b8860b',
    minZoomRatio: base.minZoomRatio != null ? toNumber(base.minZoomRatio, 'minZoomRatio') : 0.2,
    roads: Object.assign({}, base.roads || {}),
    landuse: Object.assign({}, base.landuse || {}),
    placeNodes: Object.assign({}, base.placeNodes || {}),
    placesFile: cli.values.places || base.placesFile || null,
    places: base.places || null,
    outDir: cli.values['out-dir'] || (base.output && base.output.dir) || '.'
  };

  if (cli.values.south != null || base.bbox.south != null) cfg.bbox.south = toNumber(cli.values.south != null ? cli.values.south : base.bbox.south, 'south');
  if (cli.values.west != null || base.bbox.west != null) cfg.bbox.west = toNumber(cli.values.west != null ? cli.values.west : base.bbox.west, 'west');
  if (cli.values.north != null || base.bbox.north != null) cfg.bbox.north = toNumber(cli.values.north != null ? cli.values.north : base.bbox.north, 'north');
  if (cli.values.east != null || base.bbox.east != null) cfg.bbox.east = toNumber(cli.values.east != null ? cli.values.east : base.bbox.east, 'east');
  if (cli.values.lat != null || base.project.lat != null) cfg.project.lat = toNumber(cli.values.lat != null ? cli.values.lat : base.project.lat, 'lat');
  if (cli.values.lng != null || base.project.lng != null) cfg.project.lng = toNumber(cli.values.lng != null ? cli.values.lng : base.project.lng, 'lng');

  cfg.placesFile = resolveFrom(configDir, cfg.placesFile);
  cfg.outDir = resolve(process.cwd(), cfg.outDir);

  return { cfg, configDir };
}

function validateConfig(cfg) {
  const project = cfg.project;
  const bbox = cfg.bbox;
  if (!project || !Number.isFinite(project.lat) || !Number.isFinite(project.lng)) fail('Falta project.lat/project.lng.');
  if (!bbox || !Number.isFinite(bbox.south) || !Number.isFinite(bbox.west) || !Number.isFinite(bbox.north) || !Number.isFinite(bbox.east)) fail('Falta bbox.south/west/north/east.');
  if (!(bbox.south < bbox.north)) fail('bbox.south debe ser menor que bbox.north.');
  if (!(bbox.west < bbox.east)) fail('bbox.west debe ser menor que bbox.east.');
  if (!(cfg.scale > 0)) fail('scale debe ser mayor que 0.');
  if (!(cfg.padding >= 0)) fail('padding no puede ser negativo.');
  if (!(cfg.minZoomRatio > 0 && cfg.minZoomRatio < 1)) fail('minZoomRatio debe estar entre 0 y 1 (excluidos).');
}

function loadPlaces(cfg) {
  let source = null;
  if (cfg.placesFile) {
    source = readJson(cfg.placesFile);
  } else if (cfg.places && typeof cfg.places === 'object') {
    source = cfg.places;
  } else {
    fail('Falta placesFile (o la clave "places" en la config) con los lugares curados.');
  }

  if (!source || !Array.isArray(source.places) || source.places.length === 0) {
    fail('El archivo de lugares debe contener un array "places" no vacío.');
  }

  const keys = [];
  source.places.forEach((place) => {
    if (keys.indexOf(place.categoria) === -1) keys.push(place.categoria);
  });
  const categories = source.categories && typeof source.categories === 'object'
    ? source.categories
    : keys.reduce((acc, key) => { acc[key] = key; return acc; }, {});

  const places = source.places.map((place, index) => {
    if (!place || typeof place.nombre !== 'string' || place.nombre.trim() === '') fail('places[' + index + '].nombre es obligatorio.');
    if (typeof place.categoria !== 'string' || place.categoria.trim() === '') fail('places[' + index + '].categoria es obligatorio.');
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) fail('places[' + index + '] necesita lat/lng numéricos.');
    return {
      nombre: place.nombre.trim(),
      categoria: place.categoria.trim(),
      lat: lat,
      lng: lng,
      dist: Number.isFinite(Number(place.dist)) ? Number(place.dist) : null,
      contacto: place.contacto == null ? '' : String(place.contacto)
    };
  });

  return { categories: categories, places: places };
}

function round(value, decimals) {
  const factor = Math.pow(10, decimals || 0);
  return Math.round(value * factor) / factor;
}

const KM_PER_DEG_LAT = 111.32;

function buildProjection(project, scale) {
  const lat0 = project.lat;
  const lng0 = project.lng;
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return {
    lat0: lat0,
    lng0: lng0,
    kmPerDegLng: kmPerDegLng,
    raw: function (lat, lng) {
      const dx = (lng - lng0) * kmPerDegLng * scale;
      const dy = -(lat - lat0) * KM_PER_DEG_LAT * scale;
      return { x: dx, y: dy };
    }
  };
}

// Ramer-Douglas-Peucker sobre puntos ya proyectados. epsilon queda expresado en
// las mismas unidades de canvas que el SVG final (≈px).
function rdp(points, epsilon) {
  if (!points || points.length < 3) return points ? points.slice() : [];
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const item = stack.pop();
    const start = item[0];
    const end = item[1];
    if (end <= start + 1) continue;
    const a = points[start];
    const b = points[end];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let maxDist = -1;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const p = points[i];
      let dist;
      if (len2 === 0) {
        dist = Math.hypot(p.x - a.x, p.y - a.y);
      } else {
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
        dist = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      }
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (maxDist > epsilon && index !== -1) {
      keep[index] = true;
      stack.push([start, index]);
      stack.push([index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonAttr(value) {
  return escapeHtml(JSON.stringify(value));
}

function pathD(points, close) {
  if (!points.length) return '';
  const commands = points.map((point, index) => {
    const x = round(point.x, 2);
    const y = round(point.y, 2);
    return (index === 0 ? 'M' : 'L') + x + ' ' + y;
  });
  return commands.join(' ') + (close ? ' Z' : '');
}

function highwayClass(highway) {
  return 'ocd-geo-road--' + (highway || 'other');
}

function landuseClass(landuse) {
  return 'ocd-geo-landuse--' + (landuse || 'other');
}

function placeRank(place) {
  const order = ['city', 'town', 'village', 'hamlet'];
  const index = order.indexOf(place);
  return index === -1 ? 4 : index;
}

async function fetchOverpass(query) {
  const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'open-codesign-build-geo-map/1.0 (local build script)',
      'Accept': 'application/json'
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    fail('Overpass respondió HTTP ' + response.status + '. ' + body.slice(0, 200));
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.elements)) fail('Overpass devolvió un payload inesperado.');
  return payload.elements;
}

function buildOverpassQuery(cfg) {
  const bbox = cfg.bbox;
  const roadsRegex = cfg.roads.highwayRegex || '^(motorway|trunk|primary|secondary|tertiary)$';
  const landuse = cfg.landuse || {};
  const placeNodes = cfg.placeNodes || {};
  const lines = [
    '[out:json][timeout:80];(',
    '  way["highway"~"' + roadsRegex + '"](' + bbox.south + ',' + bbox.west + ',' + bbox.north + ',' + bbox.east + ');'
  ];
  if (landuse.enabled !== false) {
    const landuseRegex = landuse.regex || '^(residential|commercial|industrial)$';
    lines.push('  way["landuse"~"' + landuseRegex + '"](' + bbox.south + ',' + bbox.west + ',' + bbox.north + ',' + bbox.east + ');');
  }
  if (placeNodes.enabled) {
    const placeRegex = placeNodes.regex || '^(city|town|village|hamlet)$';
    lines.push('  node["place"~"' + placeRegex + '"](' + bbox.south + ',' + bbox.west + ',' + bbox.north + ',' + bbox.east + ');');
  }
  lines.push(');out geom;');
  return lines.join('\n');
}

function collectRawBounds(projection, cfg, places, roads, landuseWays, placeNodes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  function add(lat, lng) {
    const point = projection.raw(lat, lng);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  add(projection.lat0, projection.lng0);
  places.forEach((place) => add(place.lat, place.lng));
  roads.forEach((road) => road.points.forEach((point) => add(point.lat, point.lng)));
  landuseWays.forEach((way) => way.points.forEach((point) => add(point.lat, point.lng)));
  placeNodes.forEach((node) => add(node.lat, node.lng));
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}

function generateCss() {
  return [
    '/* Open CoDesign - geo-map generado por scripts/build-geo-map.mjs',
    '   Atribución obligatoria por la licencia ODbL de OpenStreetMap:',
    '   (c) OpenStreetMap contributors (ODbL). */',
    '.ocd-geo-map {',
    '  position: relative;',
    '  width: 100%;',
    '  min-height: 520px;',
    '  overflow: hidden;',
    '  background: #eef3ee;',
    '  border: 1px solid #d5dcd2;',
    '  border-radius: 6px;',
    '  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;',
    '  color: #27312c;',
    '}',
    '.ocd-geo-map__body { position: absolute; inset: 0; }',
    '.ocd-geo-map svg { display: block; width: 100%; height: 100%; touch-action: none; }',
    '.ocd-geo-map__landuse { stroke: none; }',
    '.ocd-geo-map__landuse--residential { fill: #e4ddc9; }',
    '.ocd-geo-map__landuse--commercial { fill: #eadfc8; }',
    '.ocd-geo-map__landuse--industrial { fill: #dcd7c5; }',
    '.ocd-geo-map__landuse--retail { fill: #e8dcc3; }',
    '.ocd-geo-map__landuse--other { fill: #e6e0cf; }',
    '.ocd-geo-map__road { fill: none; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }',
    '.ocd-geo-map__road--motorway { stroke: #e0a13c; stroke-width: 3.2; }',
    '.ocd-geo-map__road--trunk { stroke: #e6ab54; stroke-width: 2.8; }',
    '.ocd-geo-map__road--primary { stroke: #f4c37a; stroke-width: 2.4; }',
    '.ocd-geo-map__road--secondary { stroke: #f6e3c4; stroke-width: 1.9; }',
    '.ocd-geo-map__road--tertiary { stroke: #ffffff; stroke-width: 1.4; }',
    '.ocd-geo-map__road--other { stroke: #faf7ef; stroke-width: 1.1; }',
    '.ocd-geo-map .zoom-constant { transform: scale(var(--zoom-k, 1)); transform-origin: 0 0; }',
    '.ocd-geo-map__project { pointer-events: none; }',
    '.ocd-geo-map__selectors { position: absolute; top: 12px; left: 12px; z-index: 5; display: flex; flex-wrap: wrap; gap: 8px; padding: 8px; background: rgba(255, 255, 255, 0.86); border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 8px; backdrop-filter: blur(8px); }',
    '.ocd-geo-map__select { min-width: 160px; padding: 8px 10px; border: 1px solid #cdd3ca; border-radius: 6px; background: #fff; color: inherit; font: inherit; }',
    '.ocd-geo-map__panel { position: absolute; right: 12px; bottom: 12px; z-index: 5; min-width: 220px; padding: 12px; background: rgba(255, 255, 255, 0.92); border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 8px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.10); }',
    '.ocd-geo-map__panel[data-empty="true"] { visibility: hidden; }',
    '.ocd-geo-map__accent { height: 4px; margin-bottom: 8px; border-radius: 999px; background: var(--ocd-geo-accent, #b8860b); }',
    '.ocd-geo-map__nombre { margin: 0 0 2px; font-size: 16px; font-weight: 700; }',
    '.ocd-geo-map__meta { margin: 0; font-size: 13px; color: #5c635c; }',
    '.ocd-geo-map__attribution { position: absolute; left: 12px; bottom: 10px; z-index: 4; margin: 0; font-size: 11px; color: #5c635c; background: rgba(255, 255, 255, 0.72); padding: 2px 6px; border-radius: 4px; }',
    '@media (max-width: 560px) {',
    '  .ocd-geo-map { min-height: 420px; }',
    '  .ocd-geo-map__selectors { left: 8px; right: 8px; top: 8px; }',
    '  .ocd-geo-map__select { flex: 1 1 100%; }',
    '  .ocd-geo-map__panel { right: 8px; bottom: 8px; left: 8px; min-width: 0; }',
    '}',
    ''
  ].join('\n');
}

function slugify(name) {
  return String(name || 'geo-map').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'geo-map';
}

function buildHtml(cfg, bounds, places, categories, roads, landuseWays, placeNodes) {
  const slug = slugify(cfg.name);
  const accentColor = cfg.accentColor;
  const placeNodeRender = (cfg.placeNodes && Array.isArray(cfg.placeNodes.render) && cfg.placeNodes.render.length)
    ? cfg.placeNodes.render
    : ['city', 'town', 'village'];
  const placeNodeMax = Number.isFinite(Number(cfg.placeNodes && cfg.placeNodes.max)) ? Number(cfg.placeNodes.max) : 12;
  const sortedPlaceNodes = placeNodes
    .filter((node) => node.name && placeNodeRender.indexOf(node.place) !== -1)
    .sort((a, b) => placeRank(a.place) - placeRank(b.place))
    .slice(0, placeNodeMax);

  const placesData = places.map((place) => ({
    nombre: place.nombre,
    categoria: place.categoria,
    dist: round(place.dist != null ? place.dist : haversineKm(cfg.project, place), 2),
    contacto: place.contacto,
    x: round(place.x, 2),
    y: round(place.y, 2)
  }));

  const boundsData = {
    minX: round(bounds.minX, 2),
    minY: round(bounds.minY, 2),
    maxX: round(bounds.maxX, 2),
    maxY: round(bounds.maxY, 2)
  };

  const project = { x: round(cfg.projectX, 2), y: round(cfg.projectY, 2) };
  const viewW = round(bounds.maxX - bounds.minX, 2);
  const viewH = round(bounds.maxY - bounds.minY, 2);
  const parts = [];
  parts.push('<div class="ocd-geo-map" data-ocd-behavior="geo-map"');
  parts.push('  data-ocd-geo-places="' + jsonAttr(placesData) + '"');
  parts.push('  data-ocd-geo-categories="' + jsonAttr(categories) + '"');
  parts.push('  data-ocd-geo-data-bounds="' + jsonAttr(boundsData) + '"');
  parts.push('  data-ocd-geo-initial-center="' + project.x + ',' + project.y + '"');
  parts.push('  data-ocd-geo-proyecto="' + project.x + ',' + project.y + '"');
  parts.push('  data-ocd-geo-min-zoom-ratio="' + escapeHtml(String(cfg.minZoomRatio)) + '"');
  parts.push('  data-ocd-geo-svg="#' + slug + '-svg"');
  parts.push('  data-ocd-geo-select-categoria="#' + slug + '-cat"');
  parts.push('  data-ocd-geo-select-lugar="#' + slug + '-lugar"');
  parts.push('  data-ocd-geo-marker="#' + slug + '-marker"');
  parts.push('  data-ocd-geo-panel="#' + slug + '-panel"');
  parts.push('  data-ocd-geo-accent="#' + slug + '-accent"');
  parts.push('  data-ocd-geo-field-nombre="#' + slug + '-nombre"');
  parts.push('  data-ocd-geo-field-categoria="#' + slug + '-categoria"');
  parts.push('  data-ocd-geo-field-distancia="#' + slug + '-distancia"');
  parts.push('  data-ocd-geo-field-contacto="#' + slug + '-contacto"');
  parts.push('  data-ocd-geo-accent-color="' + escapeHtml(accentColor) + '"');
  parts.push('  style="--ocd-geo-accent:' + escapeHtml(accentColor) + '">');
  parts.push('  <div class="ocd-geo-map__body">');
  parts.push('    <svg id="' + slug + '-svg" viewBox="' + boundsData.minX + ' ' + boundsData.minY + ' ' + viewW + ' ' + viewH + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de ubicación de ' + escapeHtml(cfg.name) + '">');

  if (landuseWays.length) {
    parts.push('      <g class="ocd-geo-map__landuse">');
    landuseWays.forEach((way) => {
      parts.push('        <path class="ocd-geo-map__landuse ' + landuseClass(way.landuse) + '" d="' + escapeHtml(pathD(way.canvas, true)) + '" />');
    });
    parts.push('      </g>');
  }

  if (roads.length) {
    parts.push('      <g class="ocd-geo-map__roads">');
    roads.forEach((road) => {
      parts.push('        <path class="ocd-geo-road ' + highwayClass(road.highway) + '" d="' + escapeHtml(pathD(road.canvas)) + '" />');
    });
    parts.push('      </g>');
  }

  if (sortedPlaceNodes.length) {
    parts.push('      <g class="ocd-geo-map__place-labels">');
    sortedPlaceNodes.forEach((node) => {
      parts.push('        <g transform="translate(' + round(node.x, 2) + ' ' + round(node.y, 2) + ')">');
      parts.push('          <g class="zoom-constant"><circle r="3" fill="#7b6f5a" /><text y="-8" text-anchor="middle" font-size="12" fill="#4b4437">' + escapeHtml(node.name) + '</text></g>');
      parts.push('        </g>');
    });
    parts.push('      </g>');
  }

  parts.push('      <g class="ocd-geo-map__project" transform="translate(' + project.x + ' ' + project.y + ')">');
  parts.push('        <g class="zoom-constant"><circle r="18" fill="rgba(184,134,11,.20)"/><circle r="7" fill="' + escapeHtml(accentColor) + '" stroke="#ffffff" stroke-width="2"/><text y="-14" text-anchor="middle" font-size="12" font-weight="700" fill="#27312c">Proyecto</text></g>');
  parts.push('      </g>');
  parts.push('      <g id="' + slug + '-marker" transform="translate(0 0)" style="display:none">');
  parts.push('        <g class="zoom-constant"><path d="M0 -18 L8 -6 L14 -6 L10 4 L12 16 L0 10 L-12 16 L-10 4 L-14 -6 L-8 -6 Z" fill="' + escapeHtml(accentColor) + '" stroke="#ffffff" stroke-width="1.5"/></g>');
  parts.push('      </g>');
  parts.push('    </svg>');

  parts.push('    <div class="ocd-geo-map__selectors">');
  parts.push('      <select id="' + slug + '-cat" class="ocd-geo-map__select" aria-label="Categoría">');
  parts.push('        <option value="">Elige una categoría</option>');
  Object.keys(categories).forEach((key) => {
    parts.push('        <option value="' + escapeHtml(key) + '">' + escapeHtml(categories[key]) + '</option>');
  });
  parts.push('      </select>');
  parts.push('      <select id="' + slug + '-lugar" class="ocd-geo-map__select" aria-label="Lugar" disabled>');
  parts.push('        <option value="">Elige una categoría primero</option>');
  parts.push('      </select>');
  parts.push('    </div>');
  parts.push('  </div>');

  parts.push('  <div class="ocd-geo-map__panel" id="' + slug + '-panel" data-empty="true">');
  parts.push('    <div class="ocd-geo-map__accent" id="' + slug + '-accent"></div>');
  parts.push('    <p class="ocd-geo-map__nombre" id="' + slug + '-nombre"></p>');
  parts.push('    <p class="ocd-geo-map__meta" id="' + slug + '-categoria"></p>');
  parts.push('    <p class="ocd-geo-map__meta" id="' + slug + '-distancia"></p>');
  parts.push('    <p class="ocd-geo-map__meta" id="' + slug + '-contacto"></p>');
  parts.push('  </div>');
  parts.push('  <p class="ocd-geo-map__attribution">© OpenStreetMap contributors (ODbL)</p>');
  parts.push('</div>');

  return parts.join('\n');
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  if (cli.values.help) {
    printUsage();
    return;
  }

  const loaded = loadConfig(cli);
  const cfg = loaded.cfg;
  validateConfig(cfg);
  const placesInput = loadPlaces(cfg);

  const projection = buildProjection(cfg.project, cfg.scale);
  const query = buildOverpassQuery(cfg);
  console.log('Fetch Overpass API...');
  const elements = await fetchOverpass(query);

  const roads = [];
  const landuseWays = [];
  const placeNodes = [];
  elements.forEach((element) => {
    if (element.type === 'way' && element.tags) {
      const points = (element.geometry || []).map((point) => ({ lat: point.lat, lng: point.lon }));
      if (element.tags.highway && points.length >= 2) {
        roads.push({ id: element.id, highway: element.tags.highway, points: points });
      } else if (element.tags.landuse && points.length >= 3) {
        landuseWays.push({ id: element.id, landuse: element.tags.landuse, points: points });
      }
    } else if (element.type === 'node' && element.tags && element.tags.place) {
      placeNodes.push({ id: element.id, place: element.tags.place, name: element.tags.name || '', lat: element.lat, lng: element.lon });
    }
  });

  console.log('Overpass devolvió ' + roads.length + ' calles, ' + landuseWays.length + ' landuse y ' + placeNodes.length + ' place nodes.');

  const rawBounds = collectRawBounds(projection, cfg, placesInput.places, roads, landuseWays, placeNodes);
  const margin = cfg.padding;
  const offsetX = -rawBounds.minX + margin;
  const offsetY = -rawBounds.minY + margin;
  const bounds = {
    minX: margin,
    minY: margin,
    maxX: margin + (rawBounds.maxX - rawBounds.minX),
    maxY: margin + (rawBounds.maxY - rawBounds.minY)
  };

  function toCanvas(point) {
    return { x: point.x + offsetX, y: point.y + offsetY };
  }

  const roadEpsilon = Number.isFinite(Number(cfg.roads.epsilon)) ? Number(cfg.roads.epsilon) : 0.7;
  roads.forEach((road) => {
    const raw = road.points.map((point) => projection.raw(point.lat, point.lng));
    const simplified = rdp(raw, roadEpsilon);
    road.canvas = simplified.map(toCanvas);
  });
  landuseWays.forEach((way) => {
    const raw = way.points.map((point) => projection.raw(point.lat, point.lng));
    const simplified = rdp(raw, roadEpsilon * 1.5);
    way.canvas = simplified.map(toCanvas);
  });
  placeNodes.forEach((node) => {
    const raw = projection.raw(node.lat, node.lng);
    node.x = raw.x + offsetX;
    node.y = raw.y + offsetY;
  });

  const projectRaw = projection.raw(cfg.project.lat, cfg.project.lng);
  cfg.projectX = projectRaw.x + offsetX;
  cfg.projectY = projectRaw.y + offsetY;

  placesInput.places.forEach((place) => {
    const raw = projection.raw(place.lat, place.lng);
    place.x = raw.x + offsetX;
    place.y = raw.y + offsetY;
  });

  const html = buildHtml(cfg, bounds, placesInput.places, placesInput.categories, roads, landuseWays, placeNodes);
  const css = generateCss();
  const fragment = '<style>\n' + css + '\n</style>\n\n' + html;

  mkdirSync(cfg.outDir, { recursive: true });
  const name = slugify(cfg.name);
  const fragmentPath = cfg.outDir + '/' + name + '.fragment.html';
  const cssPath = cfg.outDir + '/' + name + '.css';
  writeFileSync(fragmentPath, fragment, 'utf8');
  writeFileSync(cssPath, css, 'utf8');

  console.log('OK. Archivos generados:');
  console.log('  ' + fragmentPath + '  (pegar tal cual en el textarea HTML del editor)');
  console.log('  ' + cssPath + '  (CSS solo, para el textarea CSS)');
  console.log('Bounds: minX=' + bounds.minX + ' minY=' + bounds.minY + ' maxX=' + round(bounds.maxX, 2) + ' maxY=' + round(bounds.maxY, 2));
  console.log('Proyecto en canvas: x=' + round(cfg.projectX, 2) + ' y=' + round(cfg.projectY, 2));
}

main().catch((error) => {
  console.error('ERROR inesperado: ' + (error && error.stack ? error.stack : error));
  process.exit(1);
});
