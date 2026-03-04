import { execFileSync } from 'child_process';

const PLATFORM_MISMATCH_HINT = 'You installed esbuild for another platform';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function probeEsbuild() {
  const esbuild = await import('esbuild');
  await esbuild.transform('export const __esbuild_probe = 1;', { loader: 'js' });
}

function getErrorText(error) {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack ?? ''}`;
  }
  return String(error);
}

function isPlatformMismatchError(error) {
  return getErrorText(error).includes(PLATFORM_MISMATCH_HINT);
}

function installForCurrentPlatform() {
  execFileSync(npmCommand, ['install', '--no-audit', '--no-fund'], {
    stdio: 'inherit',
  });
}

async function ensureEsbuildPlatformBinary() {
  try {
    await probeEsbuild();
    return;
  } catch (error) {
    if (!isPlatformMismatchError(error)) {
      throw error;
    }
  }

  console.warn('Detected esbuild platform mismatch. Running npm install to sync optional binaries...');
  installForCurrentPlatform();
  await probeEsbuild();
  console.log('esbuild platform binaries are ready.');
}

ensureEsbuildPlatformBinary().catch((error) => {
  console.error('Failed to prepare esbuild platform binary:', error);
  process.exit(1);
});
