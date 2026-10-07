const { withProjectBuildGradle } = require('expo/config-plugins');

const withAndroidKotlinFix = (config) => {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      let contents = config.modResults.contents;
      
      const fixSnippet = `
allprojects {
    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        try {
            compilerOptions.freeCompilerArgs.addAll([
                "-Xskip-metadata-version-check",
                "-Xskip-prerelease-check"
            ])
        } catch (Throwable ignored) {
            try {
                kotlinOptions.freeCompilerArgs += [
                    "-Xskip-metadata-version-check",
                    "-Xskip-prerelease-check"
                ]
            } catch (Throwable ignored2) {}
        }
    }
}
`;
      if (contents.includes('-Xskip-metadata-version-check')) {
        contents = contents.replace(
          /allprojects\s*\{\s*tasks\.withType\(org\.jetbrains\.kotlin\.gradle\.tasks\.KotlinCompile\)[\s\S]*?-Xskip-prerelease-check[\s\S]*?\}\s*\}\s*\}/,
          fixSnippet.trim()
        );
      } else {
        contents += fixSnippet;
      }
      config.modResults.contents = contents;
    }
    return config;
  });
};

module.exports = withAndroidKotlinFix;
