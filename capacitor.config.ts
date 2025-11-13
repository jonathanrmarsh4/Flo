import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flo.healthapp',
  appName: 'Flō',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'automatic',
  }
};

export default config;
