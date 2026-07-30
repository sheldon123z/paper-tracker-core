import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.papertracker.app',
  appName: '专业领域大模型智能文献检索与知识服务',
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
