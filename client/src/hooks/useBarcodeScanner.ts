import { Capacitor } from '@capacitor/core';
import { useState, useEffect, useRef } from 'react';

interface ScanResult {
  barcode: string;
  format: string;
}

interface BarcodeScannerHook {
  isAvailable: boolean;
  isSupported: boolean;
  scanBarcode: () => Promise<ScanResult | null>;
  checkPermissions: () => Promise<boolean>;
  requestPermissions: () => Promise<boolean>;
}

export function useBarcodeScanner(): BarcodeScannerHook {
  const isNative = Capacitor.isNativePlatform();
  const [isSupported, setIsSupported] = useState(false);
  const scannerModuleRef = useRef<any>(null);
  
  useEffect(() => {
    const loadAndCheckSupport = async () => {
      if (!isNative) {
        console.log('[BarcodeScanner] Not native platform, skipping');
        setIsSupported(false);
        return;
      }
      
      try {
        console.log('[BarcodeScanner] Dynamically importing MLKit module...');
        const module = await import('@capacitor-mlkit/barcode-scanning');
        scannerModuleRef.current = module;
        console.log('[BarcodeScanner] Module loaded successfully');
        
        const { supported } = await module.BarcodeScanner.isSupported();
        console.log('[BarcodeScanner] isSupported result:', supported);
        setIsSupported(supported);
      } catch (error) {
        console.error('[BarcodeScanner] Error loading/checking support:', error);
        setIsSupported(false);
      }
    };
    
    loadAndCheckSupport();
  }, [isNative]);
  
  console.log('[BarcodeScanner] Hook state - isNative:', isNative, 'isSupported:', isSupported, 'platform:', Capacitor.getPlatform());

  const getScanner = async () => {
    if (scannerModuleRef.current) {
      return scannerModuleRef.current;
    }
    const module = await import('@capacitor-mlkit/barcode-scanning');
    scannerModuleRef.current = module;
    return module;
  };

  const checkPermissions = async (): Promise<boolean> => {
    if (!isNative) return false;
    
    try {
      console.log('[BarcodeScanner] Checking permissions...');
      const { BarcodeScanner } = await getScanner();
      const { camera } = await BarcodeScanner.checkPermissions();
      console.log('[BarcodeScanner] Permission status:', camera);
      return camera === 'granted';
    } catch (error) {
      console.error('[BarcodeScanner] Permission check failed:', error);
      return false;
    }
  };

  const requestPermissions = async (): Promise<boolean> => {
    if (!isNative) return false;
    
    try {
      console.log('[BarcodeScanner] Requesting permissions...');
      const { BarcodeScanner } = await getScanner();
      const { camera } = await BarcodeScanner.requestPermissions();
      console.log('[BarcodeScanner] Permission request result:', camera);
      return camera === 'granted';
    } catch (error) {
      console.error('[BarcodeScanner] Permission request failed:', error);
      return false;
    }
  };

  const scanBarcode = async (): Promise<ScanResult | null> => {
    console.log('[BarcodeScanner] scanBarcode called, isNative:', isNative);
    
    if (!isNative) {
      console.log('[BarcodeScanner] Not available on web');
      return null;
    }

    try {
      const { BarcodeScanner, BarcodeFormat } = await getScanner();
      
      console.log('[BarcodeScanner] Checking/requesting permissions...');
      const { camera } = await BarcodeScanner.checkPermissions();
      console.log('[BarcodeScanner] Has permission:', camera);
      
      if (camera !== 'granted') {
        const result = await BarcodeScanner.requestPermissions();
        console.log('[BarcodeScanner] Permission granted after request:', result.camera);
        if (result.camera !== 'granted') {
          console.log('[BarcodeScanner] Camera permission denied');
          return null;
        }
      }

      console.log('[BarcodeScanner] Calling BarcodeScanner.scan()...');
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

      console.log('[BarcodeScanner] Scan completed, barcodes count:', barcodes.length);

      if (barcodes.length > 0) {
        const scanned = barcodes[0];
        console.log('[BarcodeScanner] Found barcode:', scanned.rawValue, 'format:', scanned.format);
        return {
          barcode: scanned.rawValue || '',
          format: scanned.format || 'unknown',
        };
      }

      console.log('[BarcodeScanner] No barcodes found');
      return null;
    } catch (error: any) {
      console.error('[BarcodeScanner] Scan error:', error, 'message:', error?.message);
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
    isSupported,
    scanBarcode,
    checkPermissions,
    requestPermissions,
  };
}
