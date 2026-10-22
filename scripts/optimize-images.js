const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targets = [
  { file: 'assets/images/favicon.png', maxDim: 48 },
  { file: 'assets/images/3D_frinds-icon.png', maxDim: 256 },
  { file: 'assets/images/3d_calendar_pink_loop.png', maxDim: 360 },
  { file: 'assets/images/3d_qr_card_loop.png', maxDim: 360 },
];

console.log('Optimizing images...');
let totalBefore = 0;
let totalAfter = 0;
const scriptPath = path.resolve('scripts/optimize_single_image.ps1');

for (const t of targets) {
  const filePath = path.resolve(t.file);
  if (!fs.existsSync(filePath)) continue;

  const beforeSize = fs.statSync(filePath).size;
  totalBefore += beforeSize;

  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -Path "${filePath}" -MaxDim ${t.maxDim}`, {
    stdio: 'inherit'
  });

  const afterSize = fs.statSync(filePath).size;
  totalAfter += afterSize;
  console.log(`  ${path.basename(t.file).padEnd(30)}: ${(beforeSize / 1024).toFixed(1)} KB -> ${(afterSize / 1024).toFixed(1)} KB (-${(((beforeSize - afterSize) / beforeSize) * 100).toFixed(0)}%)`);
}

console.log(`Total: ${(totalBefore / 1024 / 1024).toFixed(2)} MB -> ${(totalAfter / 1024 / 1024).toFixed(2)} MB (Saved ${((totalBefore - totalAfter) / 1024 / 1024).toFixed(2)} MB)`);
