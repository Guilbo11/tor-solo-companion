import { chmodSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ESBUILD_NAMESPACE = '@esbuild';
const projectRoot = process.cwd();
const esbuildRoot = join(projectRoot, 'node_modules', ESBUILD_NAMESPACE);

function findEsbuildBinaries() {
  if (!existsSync(esbuildRoot)) {
    return [];
  }

  return readdirSync(esbuildRoot)
    .map((entry) => join(esbuildRoot, entry, 'bin', 'esbuild'))
    .filter((candidate) => existsSync(candidate));
}

function fixPermissions(targets) {
  if (process.platform === 'win32') {
    return;
  }

  targets.forEach((binaryPath) => {
    chmodSync(binaryPath, 0o755);
    console.log(`Adjusted permissions for ${binaryPath}`);
  });
}

const binaries = findEsbuildBinaries();
if (binaries.length > 0) {
  fixPermissions(binaries);
}
