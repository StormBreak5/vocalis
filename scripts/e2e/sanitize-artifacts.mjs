import { createWriteStream } from 'node:fs';
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { yauzl, yazl } from 'playwright-core/lib/utilsBundle';

const openZip = promisify(yauzl.open);
const TEXT_EXTENSIONS = new Set([
  '',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.network',
  '.stacks',
  '.trace',
  '.ts',
  '.txt',
]);

const SENSITIVE_PATTERNS = [
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi,
  /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+\b/gi,
  /((?:authorization|apikey)["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s"',}]+/gi,
  /((?:access_token|refresh_token)\\?["']?\s*:\s*\\?["'])[^"']+/gi,
];

export function sanitizeArtifactText(value) {
  let sanitized = value;
  sanitized = sanitized.replace(SENSITIVE_PATTERNS[0], '[REDACTED_JWT]');
  sanitized = sanitized.replace(
    SENSITIVE_PATTERNS[1],
    '[REDACTED_DATABASE_URL]',
  );
  sanitized = sanitized.replace(SENSITIVE_PATTERNS[2], '[REDACTED_SUPABASE_KEY]');
  sanitized = sanitized.replace(SENSITIVE_PATTERNS[3], '$1[REDACTED_CREDENTIAL]');
  sanitized = sanitized.replace(SENSITIVE_PATTERNS[4], '$1[REDACTED_TOKEN]');
  return sanitized;
}

function isTextFile(filePath, buffer) {
  if (TEXT_EXTENSIONS.has(extname(filePath).toLowerCase())) return true;
  return !buffer.subarray(0, 4_096).includes(0);
}

async function readStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function sanitizeZip(filePath) {
  const source = await openZip(filePath, { lazyEntries: true });
  const destinationPath = `${filePath}.sanitized`;
  const destination = new yazl.ZipFile();

  const outputComplete = new Promise((resolve, reject) => {
    destination.outputStream
      .pipe(createWriteStream(destinationPath))
      .once('close', resolve)
      .once('error', reject);
  });

  await new Promise((resolve, reject) => {
    source.once('error', reject);
    source.once('end', resolve);
    source.on('entry', (entry) => {
      if (entry.fileName.endsWith('/')) {
        destination.addEmptyDirectory(entry.fileName);
        source.readEntry();
        return;
      }

      source.openReadStream(entry, async (error, stream) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          let buffer = await readStream(stream);
          if (isTextFile(entry.fileName, buffer)) {
            buffer = Buffer.from(
              sanitizeArtifactText(buffer.toString('utf8')),
              'utf8',
            );
          }
          destination.addBuffer(buffer, entry.fileName);
          source.readEntry();
        } catch (streamError) {
          reject(streamError);
        }
      });
    });
    source.readEntry();
  });

  source.close();
  destination.end();
  await outputComplete;
  await rename(destinationPath, filePath);
}

async function sanitizePath(filePath) {
  const details = await stat(filePath);
  if (details.isDirectory()) {
    const children = await readdir(filePath);
    for (const child of children) await sanitizePath(join(filePath, child));
    return;
  }

  if (filePath.endsWith('.zip')) {
    await sanitizeZip(filePath);
    return;
  }

  const buffer = await readFile(filePath);
  if (!isTextFile(filePath, buffer)) return;
  await writeFile(filePath, sanitizeArtifactText(buffer.toString('utf8')), 'utf8');
}

async function main() {
  const roots = process.argv.slice(2);
  for (const root of roots) {
    try {
      await sanitizePath(root);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  process.stdout.write('[artifacts] Diagnósticos sanitizados.\n');
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch((error) => {
    process.stderr.write(`[artifacts] Falha na sanitização: ${error.message}\n`);
    process.exitCode = 1;
  });
}
