import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flo.healthapp',
  appName: 'Flō',
  webDir: 'dist/public',
  server: {
    // Production backend - your published Replit app
    url: 'https://get-flo.com',
    cleartext: false,
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'automatic',
  }
};

export default config;
