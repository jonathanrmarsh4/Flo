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
    private var isCapturing = false
    private let targetSampleRate: Double = 16000.0
    
    @objc func startCapture(_ call: CAPPluginCall) {
        guard !isCapturing else {
            call.resolve(["success": true, "message": "Already capturing"])
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
                try session.setActive(true)
                print("🎤 [NativeMic] AVAudioSession configured for voice chat")
                
                self.audioEngine = AVAudioEngine()
                guard let audioEngine = self.audioEngine else {
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
                    DispatchQueue.main.async {
                        call.reject("Failed to create audio converter")
                    }
                    return
                }
                
                inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] (buffer, time) in
                    guard let self = self else { return }
                    
                    let frameCount = UInt32(Double(buffer.frameLength) * self.targetSampleRate / inputFormat.sampleRate)
                    guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCount) else {
                        print("❌ [NativeMic] Failed to create converted buffer")
                        return
                    }
                    
                    var error: NSError?
                    let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
                        outStatus.pointee = .haveData
                        return buffer
                    }
                    
                    converter.convert(to: convertedBuffer, error: &error, withInputFrom: inputBlock)
                    
                    if let error = error {
                        print("❌ [NativeMic] Conversion error: \(error)")
                        return
                    }
                    
                    guard let int16Data = convertedBuffer.int16ChannelData else {
                        print("❌ [NativeMic] No int16 data available")
                        return
                    }
                    
                    let samples = Array(UnsafeBufferPointer(start: int16Data[0], count: Int(convertedBuffer.frameLength)))
                    
                    var rms: Float = 0
                    for sample in samples {
                        let floatSample = Float(sample) / 32768.0
                        rms += floatSample * floatSample
                    }
                    rms = sqrt(rms / Float(samples.count))
                    
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
                print("❌ [NativeMic] Failed to start capture: \(error)")
                DispatchQueue.main.async {
                    call.reject("Failed to start microphone capture: \(error.localizedDescription)")
                }
            }
        }
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
        
        print("🛑 [NativeMic] Audio capture stopped")
        call.resolve(["success": true, "message": "Microphone capture stopped"])
    }
    
    @objc func isCapturing(_ call: CAPPluginCall) {
        call.resolve(["capturing": isCapturing])
    }
    
    deinit {
        if isCapturing {
            audioEngine?.inputNode.removeTap(onBus: 0)
            audioEngine?.stop()
        }
    }
}
