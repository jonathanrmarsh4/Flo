import SwiftUI

struct ContentView: View {
    @StateObject private var healthKitManager = HealthKitManager()
    @StateObject private var importManager = ImportManager()
    
    @State private var email = ""
    @State private var apiKey = ""
    @State private var serverURL = "https://get-flo.replit.app"
    @State private var daysToImport = 90
    @State private var isImporting = false
    @State private var importLog: [String] = []
    @State private var showingSettings = false
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                statusHeader
                
                List {
                    configSection
                    dataTypesSection
                    importSection
                    logSection
                }
            }
            .navigationTitle("Flo HealthKit Importer")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingSettings = true }) {
                        Image(systemName: "gear")
                    }
                }
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView(serverURL: $serverURL)
            }
            .onAppear {
                loadSavedCredentials()
            }
        }
    }
    
    private var statusHeader: some View {
        HStack {
            VStack(alignment: .leading) {
                Text("HealthKit Access")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(healthKitManager.authStatus.rawValue)
                    .font(.headline)
                    .foregroundColor(healthKitManager.authStatus == .authorized ? .green : .orange)
            }
            
            Spacer()
            
            if healthKitManager.authStatus != .authorized {
                Button("Request Access") {
                    Task {
                        await healthKitManager.requestAuthorization()
                    }
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding()
        .background(Color(.systemBackground))
    }
    
    private var configSection: some View {
        Section("Configuration") {
            TextField("Email (user to import for)", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
            
            SecureField("Dev Import API Key", text: $apiKey)
            
            Stepper("Days to import: \(daysToImport)", value: $daysToImport, in: 7...365, step: 7)
            
            Button("Save Credentials") {
                saveCredentials()
            }
        }
    }
    
    private var dataTypesSection: some View {
        Section("Data Types to Import") {
            ForEach(HealthDataCategory.allCases, id: \.self) { category in
                DisclosureGroup {
                    ForEach(category.dataTypes, id: \.self) { dataType in
                        HStack {
                            Text(dataType.displayName)
                            Spacer()
                            if healthKitManager.availableTypes.contains(dataType.identifier) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                            } else {
                                Image(systemName: "xmark.circle")
                                    .foregroundColor(.secondary)
                            }
                        }
                        .font(.callout)
                    }
                } label: {
                    HStack {
                        Image(systemName: category.icon)
                            .foregroundColor(category.color)
                        Text(category.name)
                        Spacer()
                        Text("\(category.dataTypes.count) types")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
    }
    
    private var importSection: some View {
        Section {
            if isImporting {
                HStack {
                    ProgressView()
                    Text("Importing...")
                        .foregroundColor(.secondary)
                }
            } else {
                Button(action: startImport) {
                    HStack {
                        Image(systemName: "arrow.up.circle.fill")
                        Text("Start Import")
                    }
                }
                .disabled(email.isEmpty || apiKey.isEmpty)
            }
            
            if let progress = importManager.progress {
                VStack(alignment: .leading, spacing: 4) {
                    Text(progress.currentPhase)
                        .font(.caption)
                        .foregroundColor(.secondary)
                    ProgressView(value: progress.fraction)
                    Text("\(progress.processed) / \(progress.total) records")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
    
    private var logSection: some View {
        Section("Import Log") {
            if importLog.isEmpty {
                Text("No imports yet")
                    .foregroundColor(.secondary)
            } else {
                ForEach(importLog, id: \.self) { log in
                    Text(log)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
    
    private func startImport() {
        guard !email.isEmpty, !apiKey.isEmpty else { return }
        
        isImporting = true
        importLog.append("[\(Date().formatted(date: .abbreviated, time: .shortened))] Starting import...")
        
        Task {
            do {
                let result = try await importManager.importHealthKitData(
                    healthKitManager: healthKitManager,
                    email: email,
                    apiKey: apiKey,
                    serverURL: serverURL,
                    daysToImport: daysToImport
                )
                
                await MainActor.run {
                    importLog.append("[\(Date().formatted(date: .abbreviated, time: .shortened))] Success: \(result)")
                    isImporting = false
                }
            } catch {
                await MainActor.run {
                    importLog.append("[\(Date().formatted(date: .abbreviated, time: .shortened))] Error: \(error.localizedDescription)")
                    isImporting = false
                }
            }
        }
    }
    
    private func saveCredentials() {
        UserDefaults.standard.set(email, forKey: "flo_import_email")
        UserDefaults.standard.set(apiKey, forKey: "flo_import_api_key")
        UserDefaults.standard.set(serverURL, forKey: "flo_import_server_url")
    }
    
    private func loadSavedCredentials() {
        email = UserDefaults.standard.string(forKey: "flo_import_email") ?? ""
        apiKey = UserDefaults.standard.string(forKey: "flo_import_api_key") ?? ""
        if let savedURL = UserDefaults.standard.string(forKey: "flo_import_server_url"), !savedURL.isEmpty {
            serverURL = savedURL
        }
    }
}

struct SettingsView: View {
    @Binding var serverURL: String
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Server Configuration") {
                    TextField("Server URL", text: $serverURL)
                        .autocapitalization(.none)
                        .keyboardType(.URL)
                    
                    Text("Default: https://get-flo.replit.app")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Section("Presets") {
                    Button("Development (Replit)") {
                        serverURL = "https://get-flo.replit.app"
                    }
                    Button("Production") {
                        serverURL = "https://get-flo.com"
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    ContentView()
}
