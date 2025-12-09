import { Geolocation, Position } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { apiRequest } from './queryClient';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  source: 'gps' | 'network' | 'manual';
}

export interface LocationPermissionStatus {
  location: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';
}

// Helper to detect if running in native iOS/Android context
// Capacitor.isNativePlatform() can return false in webview contexts
function isNativeContext(): boolean {
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();
  const isIOS = platform === 'ios';
  const isAndroid = platform === 'android';
  
  console.log('[LocationService] Platform detection:', { platform, isNative, isIOS, isAndroid });
  
  // Consider native if either the explicit check passes OR platform is ios/android
  return isNative || isIOS || isAndroid;
}

class LocationService {
  private lastKnownLocation: LocationData | null = null;
  private watchId: string | null = null;

  async checkPermissions(): Promise<LocationPermissionStatus> {
    if (!isNativeContext()) {
      console.log('[LocationService] Not in native context, returning denied');
      return { location: 'denied' };
    }
    
    try {
      const result = await Geolocation.checkPermissions();
      console.log('[LocationService] Permission check result:', result.location);
      return { location: result.location };
    } catch (error) {
      console.error('[LocationService] Error checking permissions:', error);
      return { location: 'denied' };
    }
  }

  async requestPermissions(): Promise<LocationPermissionStatus> {
    if (!isNativeContext()) {
      console.log('[LocationService] Not in native context, cannot request permissions');
      return { location: 'denied' };
    }
    
    try {
      const result = await Geolocation.requestPermissions();
      console.log('[LocationService] Permission request result:', result.location);
      return { location: result.location };
    } catch (error) {
      console.error('[LocationService] Error requesting permissions:', error);
      return { location: 'denied' };
    }
  }

  async getCurrentPosition(): Promise<LocationData | null> {
    if (!isNativeContext()) {
      console.log('[LocationService] Not in native context, skipping location');
      return null;
    }
    
    try {
      const permission = await this.checkPermissions();
      if (permission.location !== 'granted') {
        console.log('[LocationService] Location permission not granted');
        return null;
      }
      
      const position: Position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });
      
      const locationData: LocationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
        source: position.coords.accuracy < 100 ? 'gps' : 'network',
      };
      
      this.lastKnownLocation = locationData;
      return locationData;
    } catch (error) {
      console.error('[LocationService] Error getting current position:', error);
      return null;
    }
  }

  async syncLocationToServer(): Promise<boolean> {
    try {
      const location = await this.getCurrentPosition();
      if (!location) {
        console.log('[LocationService] No location to sync');
        return false;
      }
      
      const response = await apiRequest('POST', '/api/location', {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        timestamp: new Date(location.timestamp).toISOString(),
        source: location.source,
      });
      
      if (!response.ok) {
        console.error('[LocationService] Failed to sync location to server');
        return false;
      }
      
      console.log('[LocationService] Location synced successfully');
      return true;
    } catch (error) {
      console.error('[LocationService] Error syncing location:', error);
      return false;
    }
  }

  getLastKnownLocation(): LocationData | null {
    return this.lastKnownLocation;
  }

  async startWatching(callback?: (location: LocationData) => void): Promise<void> {
    if (!isNativeContext() || this.watchId) {
      return;
    }
    
    try {
      const permission = await this.checkPermissions();
      if (permission.location !== 'granted') {
        return;
      }
      
      this.watchId = await Geolocation.watchPosition(
        {
          enableHighAccuracy: false,
          timeout: 30000,
          maximumAge: 300000,
        },
        (position, err) => {
          if (err) {
            console.error('[LocationService] Watch error:', err);
            return;
          }
          
          if (position) {
            const locationData: LocationData = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp,
              source: position.coords.accuracy < 100 ? 'gps' : 'network',
            };
            
            this.lastKnownLocation = locationData;
            callback?.(locationData);
          }
        }
      );
    } catch (error) {
      console.error('[LocationService] Error starting watch:', error);
    }
  }

  async stopWatching(): Promise<void> {
    if (this.watchId) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }
  }
}

export const locationService = new LocationService();
