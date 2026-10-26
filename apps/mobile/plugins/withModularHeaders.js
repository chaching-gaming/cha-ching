const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin to add modular headers for Google Sign-In dependencies.
 * Fixes: "The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and `RecaptchaInterop`,
 * which do not define modules."
 */
function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      if (!fs.existsSync(podfilePath)) {
        return config;
      }

      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      // Add modular headers for problematic pods after use_expo_modules!
      const modularHeadersCode = `
  # Fix for Google Sign-In Swift dependencies
  pod 'GoogleUtilities', :modular_headers => true
  pod 'RecaptchaInterop', :modular_headers => true
`;

      // Check if already added
      if (podfileContent.includes("pod 'GoogleUtilities', :modular_headers => true")) {
        return config;
      }

      // Insert after use_expo_modules! line
      podfileContent = podfileContent.replace(
        /use_expo_modules!/,
        `use_expo_modules!${modularHeadersCode}`
      );

      fs.writeFileSync(podfilePath, podfileContent);

      return config;
    },
  ]);
}

module.exports = withModularHeaders;
