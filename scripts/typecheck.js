const ts = require('typescript');

const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, './');
console.log(`Checking ${parsed.fileNames.length} TypeScript files...`);

const prog = ts.createProgram(parsed.fileNames, {
  ...parsed.options,
  noEmit: true,
  skipLibCheck: true,
});

let errorCount = 0;
for (let i = 0; i < parsed.fileNames.length; i++) {
  const file = prog.getSourceFile(parsed.fileNames[i]);
  if (!file) continue;
  const diags = prog.getSemanticDiagnostics(file);
  if (diags.length > 0) {
    errorCount += diags.length;
    console.error(
      ts.formatDiagnosticsWithColorAndContext(diags, {
        getCurrentDirectory: () => process.cwd(),
        getCanonicalFileName: (f) => f,
        getNewLine: () => '\n',
      })
    );
  }
}

if (errorCount === 0) {
  console.log('✓ TypeScript check passed with 0 errors!');
  process.exit(0);
} else {
  console.error(`✗ Total ${errorCount} errors found.`);
  process.exit(1);
}
