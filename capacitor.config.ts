import { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'com.flo.healthapp',
  appName: 'Flō',
  webDir: 'dist/public',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'automatic',
  }
};

export default config;
