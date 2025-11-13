import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flo.healthapp',
  appName: 'Flō',
  webDir: 'dist/public',
  server: {
    // For production iOS builds, uncomment and set your published Replit URL:
    // url: 'https://your-app-name.replit.app',
    // cleartext: false,
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'automatic',
  }
};

export default config;
