import Foundation
import Capacitor
import HealthKit

@objc(HealthSyncPlugin)
public class HealthSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthSyncPlugin"
    public let jsName = "HealthSyncPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncReadinessData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncWorkouts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAuthToken", returnType: CAPPluginReturnPromise)
    ]
    
    private var activeSyncCount = 0
    private let syncCountLock = NSLock()
    
    private static let backfillCompleteKey = "healthkit_backfill_complete"
    private static let lastSyncDateKey = "healthkit_last_sync_date"
    private static let jwtTokenKey = "jwt_token"
    
    // MARK: - Token Management
    
    /// Store auth token securely
    /// Token persists until explicitly cleared or replaced by a new token
    private func storeAuthToken(_ token: String) {
        UserDefaults.standard.set(token, forKey: HealthSyncPlugin.jwtTokenKey)
        UserDefaults.standard.synchronize()
        print("🔑 [HealthSyncPlugin] Auth token stored securely")
    }
    
    /// Retrieve auth token
    /// Returns nil if no token is stored
    private func getAuthToken() -> String? {
        return UserDefaults.standard.string(forKey: HealthSyncPlugin.jwtTokenKey)
    }
    
    /// Check if we have a valid auth token
    private func hasValidAuthToken() -> Bool {
        guard let token = getAuthToken() else {
            return false
        }
        // Basic validation - token should not be empty
        return !token.isEmpty
    }
    
    /// Explicitly clear auth token (called from JS when user logs out)
    @objc func clearAuthToken(_ call: CAPPluginCall) {
        print("🧹 [HealthSyncPlugin] Explicitly clearing auth token (user logout)")
        UserDefaults.standard.removeObject(forKey: HealthSyncPlugin.jwtTokenKey)
        UserDefaults.standard.synchronize()
        call.resolve(["success": true])
    }
    
    // MARK: - HealthKit Types
    
    private func buildAllHealthKitTypes() -> Set<HKObjectType> {
        var types: Set<HKObjectType> = []
        var unavailableTypes: [String] = []
        
        for dataType in FloHealthDataType.allCases {
            do {
                let sampleType = try dataType.sampleType()
                types.insert(sampleType)
            } catch {
                unavailableTypes.append(dataType.rawValue)
            }
        }
        
        types.insert(HKObjectType.workoutType())
        
        if !unavailableTypes.isEmpty {
            print("⚠️ [HealthSyncPlugin] Some HealthKit types unavailable on this device: \(unavailableTypes.joined(separator: ", "))")
        }
        
        print("✅ [HealthSyncPlugin] Requesting authorization for \(types.count) HealthKit data types")
        return types
    }
    
    // MARK: - Authorization
    
    @objc func requestAuthorization(_ call: CAPPluginCall) {
        print("🔐 [HealthSyncPlugin] requestAuthorization called")
        
        guard HKHealthStore.isHealthDataAvailable() else {
            print("❌ [HealthSyncPlugin] HealthKit not available")
            call.reject("HealthKit is not available on this device")
            return
        }
        
        let healthStore = HKHealthStore()
        let readTypes = buildAllHealthKitTypes()
        
        print("🔐 [HealthSyncPlugin] Requesting authorization for \(readTypes.count) types...")
        
        healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            DispatchQueue.main.async {
                if let error = error {
                    print("❌ [HealthSyncPlugin] Authorization error: \(error.localizedDescription)")
                    call.reject(error.localizedDescription)
                    return
                }
                
                print("✅ [HealthSyncPlugin] Authorization completed, success: \(success)")
                
                var readAuthorized: [String] = []
                var readDenied: [String] = []
                
                for dataType in FloHealthDataType.allCases {
                    if let sampleType = try? dataType.sampleType() {
                        let status = healthStore.authorizationStatus(for: sampleType)
                        switch status {
                        case .sharingAuthorized:
                            readAuthorized.append(dataType.rawValue)
                        default:
                            readDenied.append(dataType.rawValue)
                        }
                    }
                }
                
                print("✅ [HealthSyncPlugin] Auth result - authorized: \(readAuthorized.count), denied: \(readDenied.count)")
                
                call.resolve([
                    "success": success,
                    "readAuthorized": readAuthorized,
                    "readDenied": readDenied,
                    "writeAuthorized": [],
                    "writeDenied": []
                ])
            }
        }
    }
    
    // MARK: - Sync Readiness Data
    
    @objc func syncReadinessData(_ call: CAPPluginCall) {
        let defaultDays = call.getInt("days") ?? 7
        let token = call.getString("token")
        let waitForAuth = call.getBool("waitForAuth") ?? false
        
        print("🔄 [HealthSyncPlugin] syncReadinessData called (defaultDays: \(defaultDays), waitForAuth: \(waitForAuth), hasToken: \(token != nil))")
        
        let healthStore = HKHealthStore()
        let readTypes = buildAllHealthKitTypes()
        
        healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                print("❌ [HealthSyncPlugin] Authorization request error: \(error.localizedDescription)")
            } else {
                print("🔓 [HealthSyncPlugin] Authorization requested for \(readTypes.count) types, success: \(success)")
            }
        }
        
        // Store new token if provided (replaces any existing token)
        if let token = token, !token.isEmpty {
            storeAuthToken(token)
        }
        
        // Verify we have a valid token before proceeding
        guard hasValidAuthToken() else {
            print("❌ [HealthSyncPlugin] No valid auth token available for sync")
            call.reject("No authentication token available")
            return
        }
        
        syncCountLock.lock()
        activeSyncCount += 1
        let currentSyncId = activeSyncCount
        syncCountLock.unlock()
        print("📊 [HealthSyncPlugin] Active syncs: \(currentSyncId)")
        
        call.resolve([
            "success": true,
            "days": defaultDays,
            "message": "Background sync started"
        ])
        
        DispatchQueue.global(qos: .background).async {
            if waitForAuth {
                print("⏳ [HealthSyncPlugin] Waiting for HealthKit authorization...")
                self.waitForHealthKitAuth(maxAttempts: 20) { ready in
                    if ready {
                        print("✅ [HealthSyncPlugin] HealthKit authorization ready, checking sync status...")
                        self.checkSyncStatusAndPerformSync(defaultDays: defaultDays, syncId: currentSyncId)
                    } else {
                        print("⚠️ [HealthSyncPlugin] HealthKit authorization timeout, checking sync status anyway...")
                        self.checkSyncStatusAndPerformSync(defaultDays: defaultDays, syncId: currentSyncId)
                    }
                }
            } else {
                self.checkSyncStatusAndPerformSync(defaultDays: defaultDays, syncId: currentSyncId)
            }
        }
    }
    
    // MARK: - Sync Status Check
    
    private func checkSyncStatusAndPerformSync(defaultDays: Int, syncId: Int) {
        print("🔍 [HealthSyncPlugin] Checking server sync status...")
        
        checkServerSyncStatus { [weak self] needsHistoricalSync, recommendedStartDate in
            guard let self = self else { return }
            
            if needsHistoricalSync {
                print("📜 [HealthSyncPlugin] Historical backfill needed! Starting full sync...")
                
                let startDate = recommendedStartDate ?? Calendar.current.date(byAdding: .year, value: -3, to: Date())!
                let daysSinceStart = Calendar.current.dateComponents([.day], from: startDate, to: Date()).day ?? 1095
                
                print("📜 [HealthSyncPlugin] Syncing \(daysSinceStart) days of historical data (from \(startDate))")
                
                self.performHistoricalBackfill(startDate: startDate, syncId: syncId) { sampleCount in
                    self.markBackfillComplete(sampleCount: sampleCount, startDate: startDate)
                }
            } else {
                print("✅ [HealthSyncPlugin] Backfill already complete, performing incremental sync (\(defaultDays) days)")
                self.performSync(days: defaultDays, syncId: syncId)
            }
        }
    }
    
    private func checkServerSyncStatus(completion: @escaping (Bool, Date?) -> Void) {
        guard let token = getAuthToken(),
              let url = URL(string: "https://get-flo.com/api/healthkit/sync-status") else {
            print("⚠️ [HealthSyncPlugin] No token or invalid URL, assuming incremental sync")
            completion(false, nil)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30.0
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("❌ [HealthSyncPlugin] Sync status request failed: \(error.localizedDescription)")
                completion(false, nil)
                return
            }
            
            // Check for auth errors
            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 401 {
                    print("❌ [HealthSyncPlugin] Sync status returned 401 Unauthorized - token may be invalid")
                    completion(false, nil)
                    return
                }
            }
            
            guard let data = data else {
                print("⚠️ [HealthSyncPlugin] No data from sync status endpoint")
                completion(false, nil)
                return
            }
            
            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    let needsHistoricalSync = json["needsHistoricalSync"] as? Bool ?? false
                    var recommendedStartDate: Date? = nil
                    
                    if let dateString = json["recommendedStartDate"] as? String {
                        let formatter = ISO8601DateFormatter()
                        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                        recommendedStartDate = formatter.date(from: dateString)
                        
                        if recommendedStartDate == nil {
                            formatter.formatOptions = [.withInternetDateTime]
                            recommendedStartDate = formatter.date(from: dateString)
                        }
                    }
                    
                    print("📊 [HealthSyncPlugin] Server sync status: needsHistoricalSync=\(needsHistoricalSync), startDate=\(recommendedStartDate?.description ?? "nil")")
                    completion(needsHistoricalSync, recommendedStartDate)
                } else {
                    print("⚠️ [HealthSyncPlugin] Could not parse sync status response")
                    completion(false, nil)
                }
            } catch {
                print("❌ [HealthSyncPlugin] JSON parsing error: \(error.localizedDescription)")
                completion(false, nil)
            }
        }.resume()
    }
    
    // MARK: - Historical Backfill
    
    private func performHistoricalBackfill(startDate: Date, syncId: Int, completion: @escaping (Int) -> Void) {
        let endDate = Date()
        let daysSinceStart = Calendar.current.dateComponents([.day], from: startDate, to: endDate).day ?? 1095
        
        print("📜 [HealthSyncPlugin] Starting HISTORICAL BACKFILL: \(daysSinceStart) days from \(startDate) to \(endDate)")
        
        let normalizationService = HealthKitNormalisationService()
        
        // Check Oura API status before syncing to enable conditional HealthKit filtering
        checkOuraApiStatus { isOuraConnected in
            normalizationService.setOuraApiConnectionStatus(isOuraConnected)
            
            normalizationService.syncDateRange(from: startDate, to: endDate) { success, sampleCount, error in
                if let error = error {
                    print("❌ [HealthSyncPlugin] Historical backfill failed: \(error.localizedDescription)")
                } else if success {
                    print("✅ [HealthSyncPlugin] Historical backfill complete! Synced \(sampleCount) samples over \(daysSinceStart) days")
                } else {
                    print("⚠️ [HealthSyncPlugin] Historical backfill completed but returned false")
                }
                
                self.syncCountLock.lock()
                self.activeSyncCount -= 1
                let remaining = self.activeSyncCount
                self.syncCountLock.unlock()
                
                print("📊 [HealthSyncPlugin] Backfill sync #\(syncId) completed, \(remaining) active syncs remaining")
                
                // NOTE: We no longer clear the token here!
                // Token persists until explicitly cleared by logout or replaced by a new sync
                // This prevents race conditions where HTTP requests are still in flight
                
                completion(sampleCount)
            }
        }
    }
    
    private func markBackfillComplete(sampleCount: Int, startDate: Date) {
        print("📝 [HealthSyncPlugin] Marking backfill complete on server...")
        
        guard let token = getAuthToken(),
              let url = URL(string: "https://get-flo.com/api/healthkit/mark-backfill-complete") else {
            print("⚠️ [HealthSyncPlugin] No token or invalid URL, cannot mark backfill complete")
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30.0
        
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        
        let body: [String: Any] = [
            "sampleCount": sampleCount,
            "startDate": formatter.string(from: startDate),
            "endDate": formatter.string(from: Date())
        ]
        
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            print("❌ [HealthSyncPlugin] Failed to serialize backfill complete body: \(error)")
            return
        }
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("❌ [HealthSyncPlugin] Mark backfill complete failed: \(error.localizedDescription)")
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 {
                    print("✅ [HealthSyncPlugin] Server acknowledged backfill complete!")
                    UserDefaults.standard.set(true, forKey: HealthSyncPlugin.backfillCompleteKey)
                    UserDefaults.standard.set(Date(), forKey: HealthSyncPlugin.lastSyncDateKey)
                    UserDefaults.standard.synchronize()
                } else if httpResponse.statusCode == 401 {
                    print("❌ [HealthSyncPlugin] Mark backfill complete returned 401 - token invalid")
                } else {
                    print("⚠️ [HealthSyncPlugin] Unexpected response from mark backfill complete: \(httpResponse.statusCode)")
                }
            }
        }.resume()
    }
    
    // MARK: - Sync Workouts
    
    @objc func syncWorkouts(_ call: CAPPluginCall) {
        let days = call.getInt("days") ?? 7
        let token = call.getString("token")
        
        print("💪 [HealthSyncPlugin] Queuing workout sync for last \(days) days...")
        
        let healthStore = HKHealthStore()
        let readTypes: Set<HKObjectType> = [
            HKObjectType.workoutType()
        ]
        
        healthStore.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            if let error = error {
                print("❌ [HealthSyncPlugin] Workout authorization request error: \(error.localizedDescription)")
            } else {
                print("🔓 [HealthSyncPlugin] Workout authorization requested, success: \(success)")
            }
        }
        
        // Store new token if provided
        if let token = token, !token.isEmpty {
            storeAuthToken(token)
        }
        
        // Verify we have a valid token
        guard hasValidAuthToken() else {
            print("❌ [HealthSyncPlugin] No valid auth token available for workout sync")
            call.reject("No authentication token available")
            return
        }
        
        call.resolve([
            "success": true,
            "days": days,
            "message": "Workout sync started"
        ])
        
        DispatchQueue.global(qos: .background).async {
            let normalizationService = HealthKitNormalisationService()
            normalizationService.syncWorkouts(days: days) { success, error in
                if let error = error {
                    print("❌ [HealthSyncPlugin] Workout sync failed: \(error.localizedDescription)")
                } else if success {
                    print("✅ [HealthSyncPlugin] Successfully synced \(days) days of workouts!")
                } else {
                    print("⚠️ [HealthSyncPlugin] Workout sync completed but returned false")
                }
                
                // NOTE: We no longer clear the token here!
                // Token persists until explicitly cleared by logout or replaced by a new sync
                print("📊 [HealthSyncPlugin] Workout sync complete (token preserved)")
            }
        }
    }
    
    // MARK: - Incremental Sync
    
    private func performSync(days: Int, syncId: Int) {
        // Verify token is still available before starting sync
        guard hasValidAuthToken() else {
            print("❌ [HealthSyncPlugin] No valid auth token for sync #\(syncId)")
            
            syncCountLock.lock()
            activeSyncCount -= 1
            syncCountLock.unlock()
            
            return
        }
        
        let normalizationService = HealthKitNormalisationService()
        
        // Check Oura API status before syncing to enable conditional HealthKit filtering
        checkOuraApiStatus { isOuraConnected in
            normalizationService.setOuraApiConnectionStatus(isOuraConnected)
            
            normalizationService.syncLastNDays(days: days) { success, error in
                if let error = error {
                    print("❌ [HealthSyncPlugin] Background sync failed: \(error.localizedDescription)")
                } else if success {
                    print("✅ [HealthSyncPlugin] Successfully synced \(days) days in background!")
                    
                    // Verify token is still valid before starting workout sync
                    guard self.hasValidAuthToken() else {
                        print("⚠️ [HealthSyncPlugin] Token no longer valid, skipping workout sync")
                        self.completeSyncOperation(syncId: syncId)
                        return
                    }
                    
                    // Sync workouts after main sync completes
                    // This is properly chained - we wait for it to complete
                    normalizationService.syncWorkouts(days: days) { workoutSuccess, workoutError in
                        if let workoutError = workoutError {
                            print("⚠️ [HealthSyncPlugin] Workout sync error: \(workoutError.localizedDescription)")
                        } else if workoutSuccess {
                            print("💪 [HealthSyncPlugin] Also synced workouts successfully!")
                        }
                        
                        // Mark sync complete AFTER all operations finish
                        self.completeSyncOperation(syncId: syncId)
                    }
                    return // Don't call completeSyncOperation twice
                } else {
                    print("⚠️ [HealthSyncPlugin] Background sync completed but returned false")
                }
                
                self.completeSyncOperation(syncId: syncId)
            }
        }
    }
    
    /// Mark a sync operation as complete
    /// This is called after ALL async operations (including nested ones) are done
    private func completeSyncOperation(syncId: Int) {
        syncCountLock.lock()
        activeSyncCount -= 1
        let remaining = activeSyncCount
        syncCountLock.unlock()
        
        print("📊 [HealthSyncPlugin] Sync #\(syncId) completed, \(remaining) active syncs remaining")
        
        // NOTE: We intentionally do NOT clear the token here!
        // The token persists until:
        // 1. User explicitly logs out (calls clearAuthToken)
        // 2. A new sync starts with a fresh token (replaces old one)
        // This prevents race conditions where HTTP requests are still in flight
        
        if remaining == 0 {
            print("✅ [HealthSyncPlugin] All sync operations complete (token preserved for next sync)")
        }
    }
    
    // MARK: - Oura API Status
    
    private func checkOuraApiStatus(completion: @escaping (Bool) -> Void) {
        guard let token = getAuthToken(),
              let url = URL(string: "https://get-flo.com/api/integrations/oura/status") else {
            print("⚠️ [HealthSyncPlugin] No token or invalid URL, assuming Oura not connected")
            completion(false)
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 5.0 // Quick timeout - don't block sync
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("⚠️ [HealthSyncPlugin] Oura status check failed: \(error.localizedDescription)")
                completion(false)
                return
            }
            
            // Check for auth errors
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 401 {
                print("⚠️ [HealthSyncPlugin] Oura status check returned 401 - token may be invalid")
                completion(false)
                return
            }
            
            guard let data = data else {
                print("⚠️ [HealthSyncPlugin] No data from Oura status endpoint")
                completion(false)
                return
            }
            
            do {
                if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let isConnected = json["connected"] as? Bool {
                    print("🔗 [HealthSyncPlugin] Oura API status: \(isConnected ? "CONNECTED" : "NOT CONNECTED")")
                    completion(isConnected)
                } else {
                    print("⚠️ [HealthSyncPlugin] Could not parse Oura status response")
                    completion(false)
                }
            } catch {
                print("❌ [HealthSyncPlugin] Oura status JSON parsing error: \(error.localizedDescription)")
                completion(false)
            }
        }.resume()
    }
    
    // MARK: - HealthKit Auth Waiting
    
    private func waitForHealthKitAuth(maxAttempts: Int, completion: @escaping (Bool) -> Void) {
        let healthStore = HKHealthStore()
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        
        var attempts = 0
        func checkAuth() {
            attempts += 1
            let status = healthStore.authorizationStatus(for: sleepType)
            
            print("🔍 [HealthSyncPlugin] Auth check attempt \(attempts)/\(maxAttempts): status = \(status.rawValue)")
            
            if status != .notDetermined {
                print("✅ [HealthSyncPlugin] Auth status determined (status=\(status.rawValue)), proceeding with sync")
                completion(true)
            } else if attempts >= maxAttempts {
                print("⏱️ [HealthSyncPlugin] Auth wait timeout after \(maxAttempts) attempts")
                completion(false)
            } else {
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.5) {
                    checkAuth()
                }
            }
        }
        
        checkAuth()
    }
}
