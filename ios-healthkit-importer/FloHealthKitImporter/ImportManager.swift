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
    
    func importHealthKitData(
        healthKitManager: HealthKitManager,
        email: String,
        apiKey: String,
        serverURL: String,
        daysToImport: Int
    ) async throws -> String {
        let calendar = Calendar.current
        let endDate = Date()
        guard let startDate = calendar.date(byAdding: .day, value: -daysToImport, to: endDate) else {
            throw ImportError.invalidDateRange
        }
        
        progress = ImportProgress(currentPhase: "Fetching daily metrics...", processed: 0, total: 4)
        
        // Fetch all data
        let dailyMetrics = try await healthKitManager.fetchDailyMetrics(startDate: startDate, endDate: endDate)
        progress = ImportProgress(currentPhase: "Fetching sleep data...", processed: 1, total: 4)
        
        let sleepNights = try await healthKitManager.fetchSleepData(startDate: startDate, endDate: endDate)
        progress = ImportProgress(currentPhase: "Fetching workouts...", processed: 2, total: 4)
        
        let workouts = try await healthKitManager.fetchWorkouts(startDate: startDate, endDate: endDate)
        progress = ImportProgress(currentPhase: "Fetching nutrition...", processed: 3, total: 4)
        
        let nutrition = try await healthKitManager.fetchNutrition(startDate: startDate, endDate: endDate)
        progress = ImportProgress(currentPhase: "Uploading to server...", processed: 4, total: 4)
        
        // Build request body
        let requestBody: [String: Any] = [
            "email": email,
            "dailyMetrics": dailyMetrics,
            "sleepNights": sleepNights,
            "workouts": workouts,
            "nutritionData": nutrition
        ]
        
        // Make API request
        let result = try await uploadToServer(
            serverURL: serverURL,
            apiKey: apiKey,
            body: requestBody
        )
        
        progress = nil
        
        return "Daily: \(dailyMetrics.count), Sleep: \(sleepNights.count), Workouts: \(workouts.count), Nutrition: \(nutrition.count)"
    }
    
    private func uploadToServer(serverURL: String, apiKey: String, body: [String: Any]) async throws -> [String: Any] {
        guard let url = URL(string: "\(serverURL)/api/dev/import-healthkit") else {
            throw ImportError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "X-Dev-Import-Key")
        
        let jsonData = try JSONSerialization.data(withJSONObject: body, options: [])
        request.httpBody = jsonData
        
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
