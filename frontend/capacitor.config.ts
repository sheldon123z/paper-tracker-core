import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.papertracker.app',
  appName: 'Paper Tracker',
  webDir: 'dist',
  server: {
    cleartext: true,
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
