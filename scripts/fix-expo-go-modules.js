const fs = require('fs');
const path = require('path');

console.log('[fix-expo-go-modules] Patching native modules for Expo Go compatibility...');

// 1. Patch expo-notifications warnOfExpoGoPushUsage.js
const notifWarnPath = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build', 'warnOfExpoGoPushUsage.js');
if (fs.existsSync(notifWarnPath)) {
  let content = fs.readFileSync(notifWarnPath, 'utf8');
  if (content.includes("throw new Error(message);")) {
    content = content.replace(
      /if\s*\(\s*Platform\.OS\s*===\s*'android'\s*\)\s*\{\s*throw new Error\(message\);\s*\}\s*else\s*if\s*\(\s*__DEV__\s*\)\s*\{/g,
      "if (__DEV__) {"
    );
    fs.writeFileSync(notifWarnPath, content, 'utf8');
    console.log('[fix-expo-go-modules] ✅ Patched expo-notifications (warnOfExpoGoPushUsage.js)');
  } else {
    console.log('[fix-expo-go-modules] ℹ️ expo-notifications already patched or doesn\'t throw.');
  }
}

// 2. Patch expo-speech-recognition ExpoSpeechRecognitionModule.js
const speechModulePath = path.join(__dirname, '..', 'node_modules', 'expo-speech-recognition', 'build', 'ExpoSpeechRecognitionModule.js');
if (fs.existsSync(speechModulePath)) {
  const safeSpeechContent = `import { requireNativeModule } from "expo";
let _nativeModule = null;
try {
  _nativeModule = requireNativeModule("ExpoSpeechRecognition");
} catch (e) {
  _nativeModule = {
    getStateAsync: async () => ({ isRecognizing: false }),
    getPermissionsAsync: async () => ({ granted: false, status: 'denied', canAskAgain: false }),
    requestPermissionsAsync: async () => ({ granted: false, status: 'denied', canAskAgain: false }),
    start: () => {},
    stop: () => {},
    abort: () => {},
    addListener: () => ({ remove: () => {} }),
    removeListeners: () => {},
  };
}
export const ExpoSpeechRecognitionModule = _nativeModule;
const stop = ExpoSpeechRecognitionModule?.stop || (() => {});
const abort = ExpoSpeechRecognitionModule?.abort || (() => {});
if (ExpoSpeechRecognitionModule) {
  ExpoSpeechRecognitionModule.abort = () => abort();
  ExpoSpeechRecognitionModule.stop = () => stop();
}
//# sourceMappingURL=ExpoSpeechRecognitionModule.js.map
`;
  fs.writeFileSync(speechModulePath, safeSpeechContent, 'utf8');
  console.log('[fix-expo-go-modules] ✅ Patched expo-speech-recognition (ExpoSpeechRecognitionModule.js)');
}

// 2b. Patch expo-speech-recognition useSpeechRecognitionEvent.js
const speechHookPath = path.join(__dirname, '..', 'node_modules', 'expo-speech-recognition', 'build', 'useSpeechRecognitionEvent.js');
if (fs.existsSync(speechHookPath)) {
  const safeHookContent = `import { ExpoSpeechRecognitionModule } from "./ExpoSpeechRecognitionModule";
import { useEventListener } from "expo";
export function useSpeechRecognitionEvent(eventName, listener) {
  try {
    return useEventListener(ExpoSpeechRecognitionModule, eventName, listener);
  } catch {
    return;
  }
}
//# sourceMappingURL=useSpeechRecognitionEvent.js.map
`;
  fs.writeFileSync(speechHookPath, safeHookContent, 'utf8');
  console.log('[fix-expo-go-modules] ✅ Patched expo-speech-recognition (useSpeechRecognitionEvent.js)');
}

// 3. Patch react-native-nitro-modules NativeNitroModules.js (module version)
const nitroModulePath = path.join(__dirname, '..', 'node_modules', 'react-native-nitro-modules', 'lib', 'module', 'turbomodule', 'NativeNitroModules.js');
if (fs.existsSync(nitroModulePath)) {
  let content = fs.readFileSync(nitroModulePath, 'utf8');
  if (content.includes("throw new ModuleNotFoundError(e);")) {
    content = content.replace(
      /try\s*\{\s*turboModule\s*=\s*TurboModuleRegistry\.getEnforcing\('NitroModules'\);\s*\}\s*catch\s*\(e\)\s*\{\s*throw new ModuleNotFoundError\(e\);\s*\}/g,
      `try {
    turboModule = TurboModuleRegistry.getEnforcing('NitroModules');
  } catch (e) {
    nitroModules = {
      version: jsVersion,
      hasModule: () => false,
      getModule: () => null,
      createHybridObject: () => null,
    };
  }
  if (turboModule != null)`
    );
    fs.writeFileSync(nitroModulePath, content, 'utf8');
    console.log('[fix-expo-go-modules] ✅ Patched react-native-nitro-modules (module NativeNitroModules.js)');
  }
}

// 3b. Patch react-native-nitro-modules NativeNitroModules.js (commonjs version)
const nitroCjsPath = path.join(__dirname, '..', 'node_modules', 'react-native-nitro-modules', 'lib', 'commonjs', 'turbomodule', 'NativeNitroModules.js');
if (fs.existsSync(nitroCjsPath)) {
  let content = fs.readFileSync(nitroCjsPath, 'utf8');
  if (content.includes("throw new _ModuleNotFoundError.ModuleNotFoundError(e);")) {
    content = content.replace(
      /try\s*\{\s*turboModule\s*=\s*_reactNative\.TurboModuleRegistry\.getEnforcing\('NitroModules'\);\s*\}\s*catch\s*\(e\)\s*\{\s*throw new _ModuleNotFoundError\.ModuleNotFoundError\(e\);\s*\}/g,
      `try {
    turboModule = _reactNative.TurboModuleRegistry.getEnforcing('NitroModules');
  } catch (e) {
    nitroModules = {
      version: jsVersion,
      hasModule: () => false,
      getModule: () => null,
      createHybridObject: () => null,
    };
  }
  if (turboModule != null)`
    );
    fs.writeFileSync(nitroCjsPath, content, 'utf8');
    console.log('[fix-expo-go-modules] ✅ Patched react-native-nitro-modules (commonjs NativeNitroModules.js)');
  }
}

// 4. Patch expo-font FontLoader.web.js & ExpoFontLoader.web.js to prevent unhandled 12000ms timeout
const fontLoaderWebPath = path.join(__dirname, '..', 'node_modules', 'expo-font', 'build', 'FontLoader.web.js');
if (fs.existsSync(fontLoaderWebPath)) {
  let content = fs.readFileSync(fontLoaderWebPath, 'utf8');
  if (content.includes("return ExpoFontLoader.loadAsync(name, input);")) {
    content = content.replace(
      "return ExpoFontLoader.loadAsync(name, input);",
      "return ExpoFontLoader.loadAsync(name, input).catch(() => {});"
    );
    fs.writeFileSync(fontLoaderWebPath, content, 'utf8');
    console.log('[fix-expo-go-modules] ✅ Patched expo-font (FontLoader.web.js)');
  }
}

const expoFontLoaderWebPath = path.join(__dirname, '..', 'node_modules', 'expo-font', 'build', 'ExpoFontLoader.web.js');
if (fs.existsSync(expoFontLoaderWebPath)) {
  let content = fs.readFileSync(expoFontLoaderWebPath, 'utf8');
  if (content.includes(".load(resource.testString ?? null, 12000)")) {
    content = content.replace(
      ".load(resource.testString ?? null, 12000)",
      ".load(resource.testString ?? null, 1500).catch(() => {})"
    );
    fs.writeFileSync(expoFontLoaderWebPath, content, 'utf8');
    console.log('[fix-expo-go-modules] ✅ Patched expo-font (ExpoFontLoader.web.js)');
  }
}

// 4b. Patch fontfaceobserver to gracefully resolve on timeout instead of throwing
const patchFontFaceObserver = (filePath) => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('t(Error(""+q+"ms timeout exceeded"))')) {
      content = content.replace(/t\(Error\(""\+q\+"ms timeout exceeded"\)\)/g, 'r(b)');
      content = content.replace(/L\(Error\(""\+q\+"ms timeout exceeded"\)\)/g, 'K(b)');
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[fix-expo-go-modules] ✅ Patched fontfaceobserver (${path.basename(filePath)})`);
    }
  }
};
patchFontFaceObserver(path.join(__dirname, '..', 'node_modules', 'fontfaceobserver', 'fontfaceobserver.standalone.js'));
patchFontFaceObserver(path.join(__dirname, '..', 'node_modules', 'fontfaceobserver', 'fontfaceobserver.js'));

// 5. Ensure expo-module-scripts base tsconfig exists so IDE / language servers can resolve `extends: "expo-module-scripts/tsconfig.base"`
const expoModuleScriptsDir = path.join(__dirname, '..', 'node_modules', 'expo-module-scripts');
if (!fs.existsSync(expoModuleScriptsDir)) {
  fs.mkdirSync(expoModuleScriptsDir, { recursive: true });
}

const baseTsConfigContent = JSON.stringify({
  compilerOptions: {
    target: "esnext",
    module: "esnext",
    moduleResolution: "bundler",
    jsx: "react-native",
    strict: false,
    skipLibCheck: true,
    noEmit: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true
  }
}, null, 2) + '\n';

const pluginTsConfigContent = JSON.stringify({
  compilerOptions: {
    target: "esnext",
    module: "esnext",
    moduleResolution: "bundler",
    strict: false,
    skipLibCheck: true,
    noEmit: true
  }
}, null, 2) + '\n';

fs.writeFileSync(path.join(expoModuleScriptsDir, 'tsconfig.base.json'), baseTsConfigContent, 'utf8');
fs.writeFileSync(path.join(expoModuleScriptsDir, 'tsconfig.plugin.json'), pluginTsConfigContent, 'utf8');
fs.writeFileSync(
  path.join(expoModuleScriptsDir, 'package.json'),
  JSON.stringify({ name: 'expo-module-scripts', version: '56.0.3' }, null, 2) + '\n',
  'utf8'
);
console.log('[fix-expo-go-modules] ✅ Created expo-module-scripts tsconfig stubs for IDE compatibility');

// 6. Ensure expo-font/tsconfig.json excludes src to prevent unneeded module rebuild and @ts-expect-error diagnostics
const fontTsConfigPath = path.join(__dirname, '..', 'node_modules', 'expo-font', 'tsconfig.json');
if (fs.existsSync(fontTsConfigPath)) {
  const cleanFontTsConfig = {
    extends: "expo-module-scripts/tsconfig.base",
    compilerOptions: {
      rootDir: "./src",
      outDir: "./build",
      skipLibCheck: true,
      noEmit: true
    },
    include: ["./build"],
    exclude: ["./src/**", "**/__mocks__/*", "**/__tests__/*", "**/__rsc_tests__/*"]
  };
  fs.writeFileSync(fontTsConfigPath, JSON.stringify(cleanFontTsConfig, null, 2) + '\n', 'utf8');
  console.log('[fix-expo-go-modules] ✅ Patched expo-font (tsconfig.json)');
}

console.log('[fix-expo-go-modules] All Expo Go patches applied successfully!');
