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
        CAPPluginMethod(name: "isCapturing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopPlayback", returnType: CAPPluginReturnPromise)
    ]
    
    private var audioEngine: AVAudioEngine?
    private var audioConverter: AVAudioConverter?
    private var isCapturing = false
    private let targetSampleRate: Double = 16000.0
    
    // Playback components
    private var playerNode: AVAudioPlayerNode?
    private var playbackMixer: AVAudioMixerNode?
    private var isPlaybackActive = false
    
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
            self.cleanupAudioEngine()
            
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
            
            // Create audio engine with both input (mic) and output (playback) support
            self.audioEngine = AVAudioEngine()
            guard let audioEngine = self.audioEngine else {
                self.restoreAudioSession()
                DispatchQueue.main.async {
                    call.reject("Failed to create audio engine")
                }
                return
            }
            
            // Setup playback node
            self.playerNode = AVAudioPlayerNode()
            self.playbackMixer = AVAudioMixerNode()
            
            guard let playerNode = self.playerNode, let playbackMixer = self.playbackMixer else {
                self.audioEngine = nil
                self.restoreAudioSession()
                DispatchQueue.main.async {
                    call.reject("Failed to create playback nodes")
                }
                return
            }
            
            audioEngine.attach(playerNode)
            audioEngine.attach(playbackMixer)
            
            // Connect playback chain: playerNode -> mixer -> mainMixer -> output
            let outputFormat = audioEngine.outputNode.inputFormat(forBus: 0)
            print("🔊 [NativeMic] Output format: \(outputFormat.sampleRate) Hz, \(outputFormat.channelCount) channels")
            
            audioEngine.connect(playerNode, to: playbackMixer, format: nil)
            audioEngine.connect(playbackMixer, to: audioEngine.mainMixerNode, format: outputFormat)
            
            // Setup microphone input
            let inputNode = audioEngine.inputNode
            let inputFormat = inputNode.outputFormat(forBus: 0)
            print("🎤 [NativeMic] Input format: \(inputFormat.sampleRate) Hz, \(inputFormat.channelCount) channels")
            
            let targetFormat = AVAudioFormat(commonFormat: .pcmFormatInt16,
                                              sampleRate: self.targetSampleRate,
                                              channels: 1,
                                              interleaved: true)!
            
            guard let converter = AVAudioConverter(from: inputFormat, to: targetFormat) else {
                self.cleanupAudioEngine()
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
                print("✅ [NativeMic] Audio engine started (capture + playback ready) at \(self.targetSampleRate) Hz")
                
                DispatchQueue.main.async {
                    call.resolve([
                        "success": true,
                        "sampleRate": self.targetSampleRate,
                        "message": "Microphone capture started"
                    ])
                }
            } catch {
                print("❌ [NativeMic] Failed to start audio engine: \(error)")
                self.cleanupAudioEngine()
                self.restoreAudioSession()
                DispatchQueue.main.async {
                    call.reject("Failed to start microphone capture: \(error.localizedDescription)")
                }
            }
        }
    }
    
    // Play audio from base64-encoded 16-bit PCM at 16kHz
    @objc func playAudio(_ call: CAPPluginCall) {
        guard let base64Audio = call.getString("audio") else {
            call.reject("Missing audio parameter")
            return
        }
        
        let sourceSampleRate = call.getDouble("sampleRate") ?? 16000.0
        
        guard let audioData = Data(base64Encoded: base64Audio) else {
            call.reject("Invalid base64 audio data")
            return
        }
        
        guard let audioEngine = self.audioEngine, let playerNode = self.playerNode else {
            print("⚠️ [NativeMic] playAudio called but no audio engine - attempting standalone playback")
            // Fallback: create temporary playback engine
            playStandaloneAudio(data: audioData, sampleRate: sourceSampleRate, call: call)
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            // Get output format from the engine (typically 48kHz stereo)
            let outputFormat = audioEngine.outputNode.inputFormat(forBus: 0)
            let outputSampleRate = outputFormat.sampleRate
            let outputChannels = outputFormat.channelCount
            
            // Convert Int16 data to Float32
            let sourceSampleCount = audioData.count / 2
            var monoSamples = [Float](repeating: 0, count: sourceSampleCount)
            
            audioData.withUnsafeBytes { rawBuffer in
                let int16Buffer = rawBuffer.bindMemory(to: Int16.self)
                for i in 0..<sourceSampleCount {
                    monoSamples[i] = Float(int16Buffer[i]) / 32768.0
                }
            }
            
            // Resample from source rate (16kHz) to output rate (48kHz)
            let resampleRatio = outputSampleRate / sourceSampleRate
            let resampledCount = Int(Double(sourceSampleCount) * resampleRatio)
            var resampledSamples = [Float](repeating: 0, count: resampledCount)
            
            for i in 0..<resampledCount {
                let srcIndex = Double(i) / resampleRatio
                let srcIndexInt = Int(srcIndex)
                let frac = Float(srcIndex - Double(srcIndexInt))
                
                if srcIndexInt + 1 < sourceSampleCount {
                    // Linear interpolation
                    resampledSamples[i] = monoSamples[srcIndexInt] * (1 - frac) + monoSamples[srcIndexInt + 1] * frac
                } else if srcIndexInt < sourceSampleCount {
                    resampledSamples[i] = monoSamples[srcIndexInt]
                }
            }
            
            // Create stereo buffer matching output format (duplicate mono to both channels)
            guard let stereoFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                                    sampleRate: outputSampleRate,
                                                    channels: outputChannels,
                                                    interleaved: false),
                  let audioBuffer = AVAudioPCMBuffer(pcmFormat: stereoFormat, frameCapacity: UInt32(resampledCount)) else {
                print("❌ [NativeMic] Failed to create stereo buffer")
                DispatchQueue.main.async {
                    call.reject("Failed to create audio buffer")
                }
                return
            }
            
            audioBuffer.frameLength = UInt32(resampledCount)
            
            // Fill all channels with the same mono data (upmix mono to stereo)
            if let channelData = audioBuffer.floatChannelData {
                for ch in 0..<Int(outputChannels) {
                    for i in 0..<resampledCount {
                        channelData[ch][i] = resampledSamples[i]
                    }
                }
            }
            
            print("🔊 [NativeMic] Playing \(resampledCount) samples at \(outputSampleRate) Hz, \(outputChannels) channels (from \(sourceSampleCount) mono @ \(sourceSampleRate))")
            
            // Start player if not already playing
            if !playerNode.isPlaying {
                playerNode.play()
            }
            
            // Schedule buffer for playback
            playerNode.scheduleBuffer(audioBuffer, completionHandler: { [weak self] in
                DispatchQueue.main.async {
                    self?.notifyListeners("playbackComplete", data: [:])
                }
            })
            
            self.isPlaybackActive = true
            let durationMs = Int(Double(sourceSampleCount) / sourceSampleRate * 1000)
            
            DispatchQueue.main.async {
                call.resolve([
                    "success": true,
                    "samplesPlayed": sourceSampleCount,
                    "durationMs": durationMs
                ])
            }
        }
    }
    
    // Fallback standalone playback when main engine isn't running
    private func playStandaloneAudio(data: Data, sampleRate: Double, call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default, options: [.defaultToSpeaker])
                try session.setActive(true)
                
                // Create temporary engine for playback
                let tempEngine = AVAudioEngine()
                let tempPlayer = AVAudioPlayerNode()
                tempEngine.attach(tempPlayer)
                
                let outputFormat = tempEngine.outputNode.inputFormat(forBus: 0)
                let outputSampleRate = outputFormat.sampleRate
                let outputChannels = outputFormat.channelCount
                
                tempEngine.connect(tempPlayer, to: tempEngine.mainMixerNode, format: outputFormat)
                
                // Convert data to float (mono)
                let sourceSampleCount = data.count / 2
                var monoSamples = [Float](repeating: 0, count: sourceSampleCount)
                data.withUnsafeBytes { rawBuffer in
                    let int16Buffer = rawBuffer.bindMemory(to: Int16.self)
                    for i in 0..<sourceSampleCount {
                        monoSamples[i] = Float(int16Buffer[i]) / 32768.0
                    }
                }
                
                // Resample to output sample rate
                let resampleRatio = outputSampleRate / sampleRate
                let resampledCount = Int(Double(sourceSampleCount) * resampleRatio)
                var resampledSamples = [Float](repeating: 0, count: resampledCount)
                
                for i in 0..<resampledCount {
                    let srcIndex = Double(i) / resampleRatio
                    let srcIndexInt = Int(srcIndex)
                    let frac = Float(srcIndex - Double(srcIndexInt))
                    
                    if srcIndexInt + 1 < sourceSampleCount {
                        resampledSamples[i] = monoSamples[srcIndexInt] * (1 - frac) + monoSamples[srcIndexInt + 1] * frac
                    } else if srcIndexInt < sourceSampleCount {
                        resampledSamples[i] = monoSamples[srcIndexInt]
                    }
                }
                
                // Create stereo buffer matching output format
                guard let stereoFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                                        sampleRate: outputSampleRate,
                                                        channels: outputChannels,
                                                        interleaved: false),
                      let audioBuffer = AVAudioPCMBuffer(pcmFormat: stereoFormat, frameCapacity: UInt32(resampledCount)) else {
                    DispatchQueue.main.async {
                        call.reject("Failed to create audio buffer")
                    }
                    return
                }
                
                audioBuffer.frameLength = UInt32(resampledCount)
                
                // Fill all channels with mono data (upmix to stereo)
                if let channelData = audioBuffer.floatChannelData {
                    for ch in 0..<Int(outputChannels) {
                        for i in 0..<resampledCount {
                            channelData[ch][i] = resampledSamples[i]
                        }
                    }
                }
                
                try tempEngine.start()
                tempPlayer.play()
                tempPlayer.scheduleBuffer(audioBuffer) {
                    tempPlayer.stop()
                    tempEngine.stop()
                    DispatchQueue.main.async {
                        self?.notifyListeners("playbackComplete", data: [:])
                    }
                }
                
                let durationMs = Int(Double(sourceSampleCount) / sampleRate * 1000)
                print("🔊 [NativeMic] Standalone playback: \(resampledCount) samples at \(outputSampleRate)Hz stereo (\(durationMs)ms)")
                
                DispatchQueue.main.async {
                    call.resolve([
                        "success": true,
                        "samplesPlayed": sourceSampleCount,
                        "durationMs": durationMs
                    ])
                }
            } catch {
                print("❌ [NativeMic] Standalone playback failed: \(error)")
                DispatchQueue.main.async {
                    call.reject("Standalone playback failed: \(error.localizedDescription)")
                }
            }
        }
    }
    
    @objc func stopPlayback(_ call: CAPPluginCall) {
        playerNode?.stop()
        isPlaybackActive = false
        print("🛑 [NativeMic] Playback stopped")
        call.resolve(["success": true])
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
    
    private func cleanupAudioEngine() {
        if isCapturing {
            audioEngine?.inputNode.removeTap(onBus: 0)
        }
        playerNode?.stop()
        audioEngine?.stop()
        
        if let player = playerNode {
            audioEngine?.detach(player)
        }
        if let mixer = playbackMixer {
            audioEngine?.detach(mixer)
        }
        
        audioEngine = nil
        audioConverter = nil
        playerNode = nil
        playbackMixer = nil
        isCapturing = false
        isPlaybackActive = false
    }
    
    @objc func stopCapture(_ call: CAPPluginCall) {
        guard isCapturing else {
            call.resolve(["success": true, "message": "Not capturing"])
            return
        }
        
        cleanupAudioEngine()
        
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
        cleanupAudioEngine()
        
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
