const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to force Android to use androidx.documentfile:documentfile:1.0.1+
 * In 1.0.0, DocumentFile.fromTreeUri has a bug where it always resolves back to the
 * root tree URI and cannot read subdirectories under a granted SAF tree.
 * Version 1.0.1+ fixes this behavior.
 */
function withDocumentFileFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      config.modResults.contents = addResolutionStrategy(config.modResults.contents);
    }
    return config;
  });
}

function addResolutionStrategy(buildGradle) {
  const forceDependency = "force 'androidx.documentfile:documentfile:1.0.1'";
  if (buildGradle.includes(forceDependency)) {
    return buildGradle;
  }

  const block = `
allprojects {
    configurations.all {
        resolutionStrategy {
            ${forceDependency}
        }
    }
}
`;
  return buildGradle + '\n' + block;
}

module.exports = withDocumentFileFix;

