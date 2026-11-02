const { withProjectBuildGradle, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for ReadSpace storage:
 * 1. Forces Android to use androidx.documentfile:documentfile:1.0.1+
 * 2. Injects MANAGE_EXTERNAL_STORAGE and storage permissions in AndroidManifest.xml
 * 3. Sets requestLegacyExternalStorage on <application>
 */
function withDocumentFileFix(config) {
  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language === 'groovy') {
      cfg.modResults.contents = addResolutionStrategy(cfg.modResults.contents);
    }
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const androidManifest = cfg.modResults.manifest;
    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    const permissions = [
      'android.permission.MANAGE_EXTERNAL_STORAGE',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ];

    for (const perm of permissions) {
      const exists = androidManifest['uses-permission'].some(
        (p) => p.$ && p.$['android:name'] === perm
      );
      if (!exists) {
        androidManifest['uses-permission'].push({
          $: { 'android:name': perm },
        });
      }
    }

    if (androidManifest.application && androidManifest.application[0]) {
      androidManifest.application[0].$['android:requestLegacyExternalStorage'] = 'true';
    }

    return cfg;
  });

  return config;
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

