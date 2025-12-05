import Foundation

struct ImportProgress {
    var currentPhase: String
    var processed: Int
    var total: Int
    
    var fraction: Double {
        guard total > 0 else { return 0 }
        return Double(processed) / Double(total)
    }
}

@MainActor
class ImportManager: ObservableObject {
    @Published var progress: ImportProgress?
    @Published var includeSamples: Bool = true
    
    func importHealthKitData(
        healthKitManager: HealthKitManager,
        email: String,
        apiKey: String,
        serverURL: String,
        daysToImport: Int,
        includeSamples: Bool = true
    ) async throws -> String {
        let calendar = Calendar.current
        let endDate = Date()
        guard let startDate = calendar.date(byAdding: .day, value: -daysToImport, to: endDate) else {
            throw ImportError.invalidDateRange
        }
        
        let totalPhases = includeSamples ? 6 : 5
        
        progress = ImportProgress(currentPhase: "Fetching daily metrics...", processed: 0, total: totalPhases)
        
        // Fetch all data
        let dailyMetrics = try await healthKitManager.fetchDailyMetrics(startDate: startDate, endDate: endDate)
        progress = ImportProgress(currentPhase: "Fetching sleep data...", processed: 1, total: totalPhases)
        
        let sleepNights = try await healthKitManager.fetchSleepData(startDate: startDate, endDate: endDate)
        progress = ImportProgress(currentPhase: "Fetching workouts...", processed: 2, total: totalPhases)
        
        let workouts = try await healthKitManager.fetchWorkouts(startDate: startDate, endDate: endDate)
        progress = ImportProgress(currentPhase: "Fetching nutrition...", processed: 3, total: totalPhases)
        
        let nutrition = try await healthKitManager.fetchNutrition(startDate: startDate, endDate: endDate)
        
        var samples: [[String: Any]] = []
        if includeSamples {
            progress = ImportProgress(currentPhase: "Fetching raw samples (heart rate, vitals)...", processed: 4, total: totalPhases)
            samples = try await healthKitManager.fetchRawSamples(startDate: startDate, endDate: endDate)
        }
        
        progress = ImportProgress(currentPhase: "Uploading to server...", processed: totalPhases - 1, total: totalPhases)
        
        // Build request body
        var requestBody: [String: Any] = [
            "email": email,
            "dailyMetrics": dailyMetrics,
            "sleepNights": sleepNights,
            "workouts": workouts,
            "nutritionData": nutrition
        ]
        
        if includeSamples && !samples.isEmpty {
            requestBody["samples"] = samples
        }
        
        // Make API request
        let result = try await uploadToServer(
            serverURL: serverURL,
            apiKey: apiKey,
            body: requestBody
        )
        
        progress = nil
        
        var summary = "Daily: \(dailyMetrics.count), Sleep: \(sleepNights.count), Workouts: \(workouts.count), Nutrition: \(nutrition.count)"
        if includeSamples {
            summary += ", Samples: \(samples.count)"
        }
        return summary
    }
    
    private func uploadToServer(serverURL: String, apiKey: String, body: [String: Any]) async throws -> [String: Any] {
        guard let url = URL(string: "\(serverURL)/api/dev/import-healthkit") else {
            throw ImportError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "X-Dev-Import-Key")
        request.timeoutInterval = 120 // 2 minutes for large payloads
        
        let jsonData = try JSONSerialization.data(withJSONObject: body, options: [])
        request.httpBody = jsonData
        
        print("[ImportManager] Uploading \(jsonData.count) bytes to \(url)")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ImportError.invalidResponse
        }
        
        guard httpResponse.statusCode == 200 else {
            if let errorMessage = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let error = errorMessage["error"] as? String {
                throw ImportError.serverError(error)
            }
            throw ImportError.serverError("HTTP \(httpResponse.statusCode)")
        }
        
        guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ImportError.invalidResponse
        }
        
        return result
    }
}

enum ImportError: LocalizedError {
    case invalidDateRange
    case invalidURL
    case invalidResponse
    case serverError(String)
    
    var errorDescription: String? {
        switch self {
        case .invalidDateRange:
            return "Invalid date range"
        case .invalidURL:
            return "Invalid server URL"
        case .invalidResponse:
            return "Invalid server response"
        case .serverError(let message):
            return "Server error: \(message)"
        }
    }
}
