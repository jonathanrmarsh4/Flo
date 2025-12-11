import { Capacitor } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';

interface ScanResult {
  barcode: string;
  format: string;
}

interface BarcodeScannerHook {
  isAvailable: boolean;
  scanBarcode: () => Promise<ScanResult | null>;
  checkPermissions: () => Promise<boolean>;
  requestPermissions: () => Promise<boolean>;
}

export function useBarcodeScanner(): BarcodeScannerHook {
  const isNative = Capacitor.isNativePlatform();

  const checkPermissions = async (): Promise<boolean> => {
    if (!isNative) return false;
    
    try {
      const { camera } = await BarcodeScanner.checkPermissions();
      return camera === 'granted';
    } catch (error) {
      console.error('[BarcodeScanner] Permission check failed:', error);
      return false;
    }
  };

  const requestPermissions = async (): Promise<boolean> => {
    if (!isNative) return false;
    
    try {
      const { camera } = await BarcodeScanner.requestPermissions();
      return camera === 'granted';
    } catch (error) {
      console.error('[BarcodeScanner] Permission request failed:', error);
      return false;
    }
  };

  const scanBarcode = async (): Promise<ScanResult | null> => {
    if (!isNative) {
      console.log('[BarcodeScanner] Not available on web');
      return null;
    }

    try {
      const hasPermission = await checkPermissions();
      if (!hasPermission) {
        const granted = await requestPermissions();
        if (!granted) {
          console.log('[BarcodeScanner] Camera permission denied');
          return null;
        }
      }

      const { barcodes } = await BarcodeScanner.scan({
        formats: [
          BarcodeFormat.UpcA,
          BarcodeFormat.UpcE,
          BarcodeFormat.Ean8,
          BarcodeFormat.Ean13,
          BarcodeFormat.Code128,
          BarcodeFormat.Code39,
          BarcodeFormat.Code93,
          BarcodeFormat.Itf,
          BarcodeFormat.DataMatrix,
          BarcodeFormat.QrCode,
        ],
      });

      if (barcodes.length > 0) {
        const scanned = barcodes[0];
        return {
          barcode: scanned.rawValue || '',
          format: scanned.format || 'unknown',
        };
      }

      return null;
    } catch (error: any) {
      if (error?.message?.includes('canceled') || error?.message?.includes('cancelled')) {
        console.log('[BarcodeScanner] Scan cancelled by user');
        return null;
      }
      console.error('[BarcodeScanner] Scan failed:', error);
      throw error;
    }
  };

  return {
    isAvailable: isNative,
    scanBarcode,
    checkPermissions,
    requestPermissions,
  };
}
