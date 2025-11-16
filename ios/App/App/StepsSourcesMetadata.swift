import Foundation

/// Metadata about steps data sources for transparency and debugging
/// Tracks which devices/apps contributed steps and how deduplication was performed
public struct StepsSourcesMetadata: Codable {
    /// Total steps from Apple Watch (if available)
    let watchSteps: Int?
    
    /// Total steps from iPhone (if available)
    let iphoneSteps: Int?
    
    /// Total steps from other apps/devices (if available)
    let otherSteps: Int?
    
    /// Final deduplicated step count (what gets reported)
    let finalSteps: Int
    
    /// Number of overlapping intervals detected
    let overlapsDetected: Int
    
    /// Number of gaps that were filled
    let gapsFilled: Int
    
    /// Priority order used (e.g., "Watch > iPhone > Other")
    let priorityOrder: String
    
    /// List of source bundle identifiers that contributed data
    let sourceIdentifiers: [String]
    
    /// Any warnings or notes about the normalization process
    let notes: String?
    
    enum CodingKeys: String, CodingKey {
        case watchSteps = "watch_steps"
        case iphoneSteps = "iphone_steps"
        case otherSteps = "other_steps"
        case finalSteps = "final_steps"
        case overlapsDetected = "overlaps_detected"
        case gapsFilled = "gaps_filled"
        case priorityOrder = "priority_order"
        case sourceIdentifiers = "source_identifiers"
        case notes
    }
}
