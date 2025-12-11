import { Capacitor, registerPlugin } from '@capacitor/core';
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

interface BarcodeScannerPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  checkCameraPermission(): Promise<{ camera: string }>;
  requestCameraPermission(): Promise<{ camera: string }>;
  scan(options: { formats: string[] }): Promise<{ barcodes: Array<{ rawValue: string; format: string }> }>;
}

const BarcodeFormats = {
  UpcA: 'UPC_A',
  UpcE: 'UPC_E', 
  Ean8: 'EAN_8',
  Ean13: 'EAN_13',
  Code128: 'CODE_128',
  Code39: 'CODE_39',
  Code93: 'CODE_93',
  Itf: 'ITF',
  DataMatrix: 'DATA_MATRIX',
  QrCode: 'QR_CODE',
};

export function useBarcodeScanner(): BarcodeScannerHook {
  const isNative = Capacitor.isNativePlatform();
  const [isSupported, setIsSupported] = useState(false);
  const scannerRef = useRef<BarcodeScannerPlugin | null>(null);
  
  useEffect(() => {
    const loadAndCheckSupport = async () => {
      if (!isNative) {
        console.log('[BarcodeScanner] Not native platform, skipping');
        setIsSupported(false);
        return;
      }
      
      try {
        console.log('[BarcodeScanner] Registering BarcodeScanner plugin...');
        const scanner = registerPlugin<BarcodeScannerPlugin>('BarcodeScanner');
        scannerRef.current = scanner;
        console.log('[BarcodeScanner] Plugin registered:', scanner);
        
        const { supported } = await scanner.isSupported();
        console.log('[BarcodeScanner] isSupported result:', supported);
        setIsSupported(supported);
      } catch (error) {
        console.error('[BarcodeScanner] Error registering/checking support:', error);
        setIsSupported(false);
      }
    };
    
    loadAndCheckSupport();
  }, [isNative]);
  
  console.log('[BarcodeScanner] Hook state - isNative:', isNative, 'isSupported:', isSupported, 'platform:', Capacitor.getPlatform());

  const getScanner = (): BarcodeScannerPlugin => {
    if (scannerRef.current) {
      return scannerRef.current;
    }
    const scanner = registerPlugin<BarcodeScannerPlugin>('BarcodeScanner');
    scannerRef.current = scanner;
    return scanner;
  };

  const checkPermissions = async (): Promise<boolean> => {
    if (!isNative) return false;
    
    try {
      console.log('[BarcodeScanner] Checking permissions...');
      const scanner = getScanner();
      const { camera } = await scanner.checkCameraPermission();
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
      const scanner = getScanner();
      const { camera } = await scanner.requestCameraPermission();
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
      const scanner = getScanner();
      
      console.log('[BarcodeScanner] Checking/requesting permissions...');
      const { camera } = await scanner.checkCameraPermission();
      console.log('[BarcodeScanner] Has permission:', camera);
      
      if (camera !== 'granted') {
        const result = await scanner.requestCameraPermission();
        console.log('[BarcodeScanner] Permission granted after request:', result.camera);
        if (result.camera !== 'granted') {
          console.log('[BarcodeScanner] Camera permission denied');
          return null;
        }
      }

      console.log('[BarcodeScanner] Calling BarcodeScanner.scan()...');
      const { barcodes } = await scanner.scan({
        formats: [
          BarcodeFormats.UpcA,
          BarcodeFormats.UpcE,
          BarcodeFormats.Ean8,
          BarcodeFormats.Ean13,
          BarcodeFormats.Code128,
          BarcodeFormats.Code39,
          BarcodeFormats.Code93,
          BarcodeFormats.Itf,
          BarcodeFormats.DataMatrix,
          BarcodeFormats.QrCode,
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
