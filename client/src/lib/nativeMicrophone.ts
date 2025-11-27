import { registerPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

export interface AudioDataEvent {
  audio: string;
  sampleRate: number;
  sampleCount: number;
  rms: number;
}

export interface PlaybackResult {
  success: boolean;
  samplesPlayed: number;
  durationMs: number;
}

export interface NativeMicrophonePlugin {
  startCapture(): Promise<{ success: boolean; sampleRate: number; message: string }>;
  stopCapture(): Promise<{ success: boolean; message: string }>;
  isCapturing(): Promise<{ capturing: boolean }>;
  playAudio(options: { audio: string; sampleRate?: number }): Promise<PlaybackResult>;
  stopPlayback(): Promise<{ success: boolean }>;
  addListener(eventName: 'audioData', listenerFunc: (event: AudioDataEvent) => void): Promise<{ remove: () => void }>;
  addListener(eventName: 'playbackComplete', listenerFunc: () => void): Promise<{ remove: () => void }>;
  removeAllListeners(): Promise<void>;
}

const NativeMicrophone = registerPlugin<NativeMicrophonePlugin>('NativeMicrophone');

export function isNativeMicrophoneAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

export async function startNativeCapture(): Promise<{ success: boolean; sampleRate: number }> {
  if (!isNativeMicrophoneAvailable()) {
    throw new Error('Native microphone not available on this platform');
  }
  
  console.log('[NativeMic] Starting native microphone capture...');
  const result = await NativeMicrophone.startCapture();
  console.log('[NativeMic] Start result:', result);
  return { success: result.success, sampleRate: result.sampleRate };
}

export async function stopNativeCapture(): Promise<void> {
  if (!isNativeMicrophoneAvailable()) {
    return;
  }
  
  console.log('[NativeMic] Stopping native microphone capture...');
  await NativeMicrophone.stopCapture();
  await NativeMicrophone.removeAllListeners();
}

export async function addAudioDataListener(
  callback: (event: AudioDataEvent) => void
): Promise<{ remove: () => void }> {
  if (!isNativeMicrophoneAvailable()) {
    throw new Error('Native microphone not available on this platform');
  }
  
  return NativeMicrophone.addListener('audioData', callback);
}

// Native audio playback for iOS (bypasses WebAudio which is blocked by AVAudioSession)
export async function playNativeAudio(base64Audio: string, sampleRate: number = 16000): Promise<PlaybackResult> {
  if (!isNativeMicrophoneAvailable()) {
    throw new Error('Native playback not available on this platform');
  }
  
  console.log('[NativeMic] Playing audio via native AVAudioEngine...');
  const result = await NativeMicrophone.playAudio({ audio: base64Audio, sampleRate });
  console.log('[NativeMic] Playback result:', result);
  return result;
}

export async function stopNativePlayback(): Promise<void> {
  if (!isNativeMicrophoneAvailable()) {
    return;
  }
  
  console.log('[NativeMic] Stopping native playback...');
  await NativeMicrophone.stopPlayback();
}

export async function addPlaybackCompleteListener(
  callback: () => void
): Promise<{ remove: () => void }> {
  if (!isNativeMicrophoneAvailable()) {
    throw new Error('Native playback not available on this platform');
  }
  
  return NativeMicrophone.addListener('playbackComplete', callback);
}

export { NativeMicrophone };
