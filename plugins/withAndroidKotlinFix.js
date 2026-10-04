const { withProjectBuildGradle } = require('expo/config-plugins');

const withAndroidKotlinFix = (config) => {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      let contents = config.modResults.contents;
      
      const fixSnippet = `
allprojects {
    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        compilerOptions {
            freeCompilerArgs.addAll(
                "-Xskip-metadata-version-check",
                "-Xskip-prerelease-check"
            )
        }
    }
}
`;
      if (!contents.includes('-Xskip-metadata-version-check')) {
        contents += fixSnippet;
      }
      config.modResults.contents = contents;
    }
    return config;
  });
};

module.exports = withAndroidKotlinFix;
