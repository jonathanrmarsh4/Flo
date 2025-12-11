import Foundation
import Capacitor
import AVFoundation
import UIKit

@objc(BarcodeScannerBridge)
class BarcodeScannerBridge: CAPPlugin, AVCaptureMetadataOutputObjectsDelegate {
    override var identifier: String { "BarcodeScannerBridge" }
    override var jsName: String { "BarcodeScanner" }
    override var pluginMethods: [CAPPluginMethod] {
        [
            CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise)
        ]
    }
    
    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var scanCall: CAPPluginCall?
    private var scannerViewController: UIViewController?
    
    @objc func isSupported(_ call: CAPPluginCall) {
        let isAvailable = AVCaptureDevice.default(for: .video) != nil
        call.resolve(["supported": isAvailable])
    }
    
    @objc func checkPermissions(_ call: CAPPluginCall) {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        let permission: String
        switch status {
        case .authorized:
            permission = "granted"
        case .denied, .restricted:
            permission = "denied"
        case .notDetermined:
            permission = "prompt"
        @unknown default:
            permission = "prompt"
        }
        call.resolve(["camera": permission])
    }
    
    @objc func requestPermissions(_ call: CAPPluginCall) {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                call.resolve(["camera": granted ? "granted" : "denied"])
            }
        }
    }
    
    @objc func scan(_ call: CAPPluginCall) {
        self.scanCall = call
        
        DispatchQueue.main.async {
            self.startScanning()
        }
    }
    
    private func startScanning() {
        guard let device = AVCaptureDevice.default(for: .video) else {
            scanCall?.reject("Camera not available")
            return
        }
        
        do {
            let input = try AVCaptureDeviceInput(device: device)
            captureSession = AVCaptureSession()
            captureSession?.addInput(input)
            
            let metadataOutput = AVCaptureMetadataOutput()
            captureSession?.addOutput(metadataOutput)
            
            metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
            metadataOutput.metadataObjectTypes = [
                .ean8, .ean13, .upce,
                .code39, .code93, .code128,
                .itf14, .dataMatrix, .qr
            ]
            
            let scannerVC = ScannerViewController()
            scannerVC.captureSession = captureSession
            scannerVC.onCancel = { [weak self] in
                self?.captureSession?.stopRunning()
                self?.scanCall?.resolve(["barcodes": []])
            }
            self.scannerViewController = scannerVC
            
            if let rootVC = self.bridge?.viewController {
                scannerVC.modalPresentationStyle = .fullScreen
                rootVC.present(scannerVC, animated: true) {
                    self.captureSession?.startRunning()
                }
            }
        } catch {
            scanCall?.reject("Failed to initialize camera: \(error.localizedDescription)")
        }
    }
    
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let metadataObject = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let stringValue = metadataObject.stringValue else {
            return
        }
        
        captureSession?.stopRunning()
        
        let formatString: String
        switch metadataObject.type {
        case .ean8: formatString = "EAN_8"
        case .ean13: formatString = "EAN_13"
        case .upce: formatString = "UPC_E"
        case .code39: formatString = "CODE_39"
        case .code93: formatString = "CODE_93"
        case .code128: formatString = "CODE_128"
        case .itf14: formatString = "ITF"
        case .dataMatrix: formatString = "DATA_MATRIX"
        case .qr: formatString = "QR_CODE"
        default: formatString = "UNKNOWN"
        }
        
        scannerViewController?.dismiss(animated: true) { [weak self] in
            self?.scanCall?.resolve([
                "barcodes": [
                    ["rawValue": stringValue, "format": formatString]
                ]
            ])
        }
    }
}

class ScannerViewController: UIViewController {
    var captureSession: AVCaptureSession?
    var onCancel: (() -> Void)?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        
        if let session = captureSession {
            previewLayer = AVCaptureVideoPreviewLayer(session: session)
            previewLayer?.frame = view.bounds
            previewLayer?.videoGravity = .resizeAspectFill
            if let layer = previewLayer {
                view.layer.addSublayer(layer)
            }
        }
        
        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.setTitleColor(.white, for: .normal)
        cancelButton.titleLabel?.font = UIFont.systemFont(ofSize: 18, weight: .medium)
        cancelButton.backgroundColor = UIColor.black.withAlphaComponent(0.5)
        cancelButton.layer.cornerRadius = 8
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        view.addSubview(cancelButton)
        
        NSLayoutConstraint.activate([
            cancelButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
            cancelButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            cancelButton.widthAnchor.constraint(equalToConstant: 120),
            cancelButton.heightAnchor.constraint(equalToConstant: 50)
        ])
        
        let instructionLabel = UILabel()
        instructionLabel.text = "Point camera at barcode"
        instructionLabel.textColor = .white
        instructionLabel.textAlignment = .center
        instructionLabel.font = UIFont.systemFont(ofSize: 16, weight: .medium)
        instructionLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(instructionLabel)
        
        NSLayoutConstraint.activate([
            instructionLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            instructionLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])
    }
    
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }
    
    @objc private func cancelTapped() {
        onCancel?()
        dismiss(animated: true)
    }
}
