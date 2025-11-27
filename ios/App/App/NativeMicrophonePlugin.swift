import Foundation
import Capacitor
import AVFoundation

@objc(NativeMicrophonePlugin)
public class NativeMicrophonePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeMicrophonePlugin"
    public let jsName = "NativeMicrophone"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startCapture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopCapture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isCapturing", returnType: CAPPluginReturnPromise)
    ]
    
    private var audioEngine: AVAudioEngine?
    private var audioConverter: AVAudioConverter?
    private var isCapturing = false
    private let targetSampleRate: Double = 16000.0
    
    // Store previous audio session configuration to restore later
    private var previousCategory: AVAudioSession.Category?
    private var previousMode: AVAudioSession.Mode?
    private var previousOptions: AVAudioSession.CategoryOptions?
    
    @objc func startCapture(_ call: CAPPluginCall) {
        guard !isCapturing else {
            call.resolve([
                "success": true, 
                "sampleRate": targetSampleRate,
                "message": "Already capturing"
            ])
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            // Clean up any stale state from previous sessions
            self.audioEngine = nil
            self.audioConverter = nil
            
            let session = AVAudioSession.sharedInstance()
            
            // Save previous audio session configuration before changing
            self.previousCategory = session.category
            self.previousMode = session.mode
            self.previousOptions = session.categoryOptions
            print("🎤 [NativeMic] Saved previous audio config: \(session.category.rawValue), \(session.mode.rawValue)")
            
            do {
                try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
                try session.setActive(true)
                print("🎤 [NativeMic] AVAudioSession configured for voice chat")
            } catch {
                print("❌ [NativeMic] Failed to configure audio session: \(error)")
                self.restoreAudioSession()
                DispatchQueue.main.async {
                    call.reject("Failed to configure audio session: \(error.localizedDescription)")
                }
                return
            }
            
            self.audioEngine = AVAudioEngine()
            guard let audioEngine = self.audioEngine else {
                self.restoreAudioSession()
                DispatchQueue.main.async {
                    call.reject("Failed to create audio engine")
                }
                return
            }
            
            let inputNode = audioEngine.inputNode
            let inputFormat = inputNode.outputFormat(forBus: 0)
            print("🎤 [NativeMic] Input format: \(inputFormat.sampleRate) Hz, \(inputFormat.channelCount) channels")
            
            let targetFormat = AVAudioFormat(commonFormat: .pcmFormatInt16,
                                              sampleRate: self.targetSampleRate,
                                              channels: 1,
                                              interleaved: true)!
            
            guard let converter = AVAudioConverter(from: inputFormat, to: targetFormat) else {
                self.audioEngine = nil
                self.restoreAudioSession()
                DispatchQueue.main.async {
                    call.reject("Failed to create audio converter")
                }
                return
            }
            self.audioConverter = converter
            
            inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] (buffer, time) in
                guard let self = self, let converter = self.audioConverter else { return }
                
                let ratio = self.targetSampleRate / inputFormat.sampleRate
                let outputFrameCapacity = UInt32(ceil(Double(buffer.frameLength) * ratio))
                
                guard outputFrameCapacity > 0,
                      let convertedBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: outputFrameCapacity) else {
                    return
                }
                
                var inputBufferConsumed = false
                let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
                    if inputBufferConsumed {
                        outStatus.pointee = .noDataNow
                        return nil
                    }
                    inputBufferConsumed = true
                    outStatus.pointee = .haveData
                    return buffer
                }
                
                var error: NSError?
                let status = converter.convert(to: convertedBuffer, error: &error, withInputFrom: inputBlock)
                
                if let error = error {
                    print("❌ [NativeMic] Conversion error: \(error)")
                    return
                }
                
                guard status != .error else {
                    print("❌ [NativeMic] Converter returned error status")
                    return
                }
                
                let frameLength = Int(convertedBuffer.frameLength)
                guard frameLength > 0, let int16Data = convertedBuffer.int16ChannelData else {
                    return
                }
                
                let samples = Array(UnsafeBufferPointer(start: int16Data[0], count: frameLength))
                
                var sumSquares: Float = 0
                for sample in samples {
                    let floatSample = Float(sample) / 32768.0
                    sumSquares += floatSample * floatSample
                }
                let rms = sqrt(sumSquares / Float(samples.count))
                
                let base64Data = Data(bytes: samples, count: samples.count * 2).base64EncodedString()
                
                DispatchQueue.main.async {
                    self.notifyListeners("audioData", data: [
                        "audio": base64Data,
                        "sampleRate": self.targetSampleRate,
                        "sampleCount": samples.count,
                        "rms": rms
                    ])
                }
            }
            
            do {
                try audioEngine.start()
                self.isCapturing = true
                print("✅ [NativeMic] Audio capture started at \(self.targetSampleRate) Hz")
                
                DispatchQueue.main.async {
                    call.resolve([
                        "success": true,
                        "sampleRate": self.targetSampleRate,
                        "message": "Microphone capture started"
                    ])
                }
            } catch {
                print("❌ [NativeMic] Failed to start audio engine: \(error)")
                audioEngine.inputNode.removeTap(onBus: 0)
                self.audioEngine = nil
                self.audioConverter = nil
                self.restoreAudioSession()
                DispatchQueue.main.async {
                    call.reject("Failed to start microphone capture: \(error.localizedDescription)")
                }
            }
        }
    }
    
    // Helper to restore audio session on failure
    private func restoreAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            if let prevCategory = previousCategory {
                try session.setCategory(
                    prevCategory,
                    mode: previousMode ?? .default,
                    options: previousOptions ?? []
                )
                print("🔄 [NativeMic] Restored audio session after failure")
            }
        } catch {
            print("⚠️ [NativeMic] Failed to restore audio session: \(error)")
        }
        previousCategory = nil
        previousMode = nil
        previousOptions = nil
    }
    
    @objc func stopCapture(_ call: CAPPluginCall) {
        guard isCapturing, let audioEngine = audioEngine else {
            call.resolve(["success": true, "message": "Not capturing"])
            return
        }
        
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        isCapturing = false
        self.audioEngine = nil
        self.audioConverter = nil
        
        // Restore previous audio session configuration
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            
            // Restore previous category/mode if we saved them
            if let prevCategory = self.previousCategory {
                try session.setCategory(
                    prevCategory,
                    mode: self.previousMode ?? .default,
                    options: self.previousOptions ?? []
                )
                print("🛑 [NativeMic] Restored previous audio config: \(prevCategory.rawValue)")
            }
            
            self.previousCategory = nil
            self.previousMode = nil
            self.previousOptions = nil
            
            print("🛑 [NativeMic] AVAudioSession deactivated and restored")
        } catch {
            print("⚠️ [NativeMic] Failed to restore audio session: \(error)")
        }
        
        print("🛑 [NativeMic] Audio capture stopped")
        call.resolve(["success": true, "message": "Microphone capture stopped"])
    }
    
    @objc func isCapturing(_ call: CAPPluginCall) {
        call.resolve(["capturing": isCapturing])
    }
    
    private func cleanupResources() {
        if isCapturing {
            audioEngine?.inputNode.removeTap(onBus: 0)
            audioEngine?.stop()
            isCapturing = false
        }
        audioEngine = nil
        audioConverter = nil
        
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            
            // Restore previous category if saved
            if let prevCategory = previousCategory {
                try session.setCategory(
                    prevCategory,
                    mode: previousMode ?? .default,
                    options: previousOptions ?? []
                )
            }
        } catch {
            print("⚠️ [NativeMic] Cleanup: Failed to restore audio session: \(error)")
        }
        
        previousCategory = nil
        previousMode = nil
        previousOptions = nil
    }
    
    deinit {
        cleanupResources()
    }
}
