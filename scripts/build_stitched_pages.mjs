#!/usr/bin/env node
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const pagesIndexPath = path.join(root, 'data/pages.json');
const outDir = path.join(root, 'audio/stitched_pages');
const tmpDir = path.join(root, '.tmp_stitched_pages');
const silenceDir = path.join(tmpDir, 'silence');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => stderr += d);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || cmd + ' exited ' + code)));
  });
}

function isDirectorLine(item) {
  const speaker = String(item.speaker || '').toUpperCase();
  return ['DIRECTOR', 'STAGE_DIRECTIONS', 'ANNOUNCER'].includes(speaker) || item.kind === 'stage_direction';
}

function ms(duration) {
  return Math.max(40, Math.round(Number(duration || 0) * 1000));
}

async function ensureSilence(durationMs) {
  await mkdir(silenceDir, { recursive: true });
  const file = path.join(silenceDir, 'silence_' + durationMs + 'ms.mp3');
  if (existsSync(file)) return file;
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', (durationMs / 1000).toFixed(3),
    '-codec:a', 'libmp3lame',
    '-b:a', '160k',
    file
  ]);
  return file;
}

async function listFor(page, mode) {
  const files = [];
  for (const line of page.lines || []) {
    const src = path.join(root, line.src || '');
    if (mode === 'learn_rodney_director' && line.speaker === 'RODNEY') {
      files.push(await ensureSilence(ms(line.duration)));
    } else if (mode === 'learn_rodney_no_director' && (line.speaker === 'RODNEY' || isDirectorLine(line))) {
      if (line.speaker === 'RODNEY') files.push(await ensureSilence(ms(line.duration)));
    } else if (line.src && existsSync(src)) {
      files.push(src);
    }
  }
  return files;
}

async function concat(files, output) {
  await mkdir(path.dirname(output), { recursive: true });
  const listPath = path.join(tmpDir, path.basename(output) + '.txt');
  const body = files.map(file => "file '" + file.replaceAll("'", "'\\''") + "'").join('\n') + '\n';
  await writeFile(listPath, body);
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0',
    '-i', listPath,
    '-vn', '-ac', '2', '-ar', '44100',
    '-codec:a', 'libmp3lame', '-b:a', '160k',
    output
  ]);
}

async function duration(file) {
  const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file];
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(Number(stdout.trim())) : reject(new Error(stderr || 'ffprobe exited ' + code)));
  });
}

async function main() {
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  const index = JSON.parse(await readFile(pagesIndexPath, 'utf8'));
  const modes = ['full_cast', 'learn_rodney_director', 'learn_rodney_no_director'];
  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceVersion: index.version,
    modes,
    pages: []
  };

  for (const meta of index.pages) {
    const pagePath = path.join(root, meta.path);
    const page = JSON.parse(await readFile(pagePath, 'utf8'));
    const entry = { page: page.page, files: {} };
    for (const mode of modes) {
      const files = await listFor(page, mode);
      if (!files.length) continue;
      const relOut = 'audio/stitched_pages/page_' + String(page.page).padStart(2, '0') + '_' + mode + '.mp3';
      const absOut = path.join(root, relOut);
      await concat(files, absOut);
      const st = await stat(absOut);
      entry.files[mode] = {
        src: relOut,
        duration: Number((await duration(absOut)).toFixed(3)),
        bytes: st.size,
        segments: files.length
      };
    }
    manifest.pages.push(entry);
    page.stitchedAudio = entry.files;
    await writeFile(pagePath, JSON.stringify(page, null, 2) + '\n');
    meta.stitchedAudio = entry.files;
    console.log('stitched page ' + page.page);
  }

  index.version = '20260519-0750';
  index.stitchedAudioManifest = 'audio/stitched_pages/manifest.json';
  await writeFile(pagesIndexPath, JSON.stringify(index, null, 2) + '\n');
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await rm(tmpDir, { recursive: true, force: true });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
