-- Medical Documents Table for Supabase
-- Stores metadata for uploaded medical reports (specialist reports, imaging, etc.)
-- Document chunks are stored in user_insights with source='medical_document'

-- Document type enum
CREATE TYPE medical_document_type AS ENUM (
  'cardiology_report',      -- Heart/cardiovascular specialist reports
  'radiology_report',       -- X-ray, MRI, CT scan reports
  'pathology_report',       -- Biopsy, tissue analysis reports
  'dermatology_report',     -- Skin specialist reports
  'endocrinology_report',   -- Hormone/thyroid specialist reports
  'gastroenterology_report', -- GI specialist reports
  'neurology_report',       -- Brain/nerve specialist reports
  'oncology_report',        -- Cancer screening/treatment reports
  'orthopedic_report',      -- Bone/joint specialist reports
  'pulmonology_report',     -- Lung specialist reports
  'rheumatology_report',    -- Autoimmune/arthritis reports
  'urology_report',         -- Urinary/kidney specialist reports
  'ophthalmology_report',   -- Eye specialist reports
  'ent_report',             -- Ear/nose/throat reports
  'allergy_report',         -- Allergy testing reports
  'sleep_study',            -- Sleep lab reports
  'genetic_test',           -- Genetic/DNA testing reports
  'imaging_report',         -- General imaging (ultrasound, etc.)
  'lab_narrative',          -- Detailed lab interpretation
  'specialist_consult',     -- General specialist consultation notes
  'discharge_summary',      -- Hospital discharge summaries
  'operative_report',       -- Surgery/procedure reports
  'physical_therapy',       -- PT evaluation/progress reports
  'mental_health',          -- Psychiatry/psychology reports
  'other'                   -- Other medical documents
);

-- Processing status enum
CREATE TYPE document_processing_status AS ENUM (
  'pending',      -- Uploaded, waiting to be processed
  'extracting',   -- Text extraction in progress
  'embedding',    -- Creating embeddings
  'completed',    -- Successfully processed
  'failed'        -- Processing failed
);

-- Main medical documents table
CREATE TABLE IF NOT EXISTS medical_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_id UUID NOT NULL,
  
  -- Document metadata
  document_type medical_document_type NOT NULL DEFAULT 'specialist_consult',
  title VARCHAR(500),                    -- User-provided or AI-extracted title
  provider_name VARCHAR(255),            -- Doctor/facility name
  document_date DATE,                    -- Date of the report/visit
  
  -- File storage
  file_path VARCHAR(1000),               -- GCS object path
  file_name VARCHAR(500),                -- Original filename
  file_size_bytes INTEGER,
  mime_type VARCHAR(100),
  
  -- Processing
  processing_status document_processing_status DEFAULT 'pending',
  processing_error TEXT,
  
  -- AI extraction results
  ai_summary TEXT,                       -- 2-3 sentence AI-generated summary
  ai_key_findings JSONB DEFAULT '[]',    -- Extracted diagnoses, recommendations, etc.
  extracted_text TEXT,                   -- Full OCR/extracted text
  chunk_count INTEGER DEFAULT 0,         -- Number of chunks stored in user_insights
  
  -- Content hash for deduplication
  content_hash VARCHAR(64),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_medical_documents_health_id ON medical_documents(health_id);
CREATE INDEX idx_medical_documents_type ON medical_documents(document_type);
CREATE INDEX idx_medical_documents_date ON medical_documents(document_date DESC);
CREATE INDEX idx_medical_documents_status ON medical_documents(processing_status);
CREATE INDEX idx_medical_documents_hash ON medical_documents(content_hash);

-- Row-level security
ALTER TABLE medical_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own documents
CREATE POLICY medical_documents_isolation ON medical_documents
  FOR ALL
  USING (health_id IN (
    SELECT health_id FROM health_profiles WHERE health_id = medical_documents.health_id
  ));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_medical_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER medical_documents_updated_at
  BEFORE UPDATE ON medical_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_medical_documents_updated_at();

-- Comments
COMMENT ON TABLE medical_documents IS 'Stores metadata for uploaded medical reports. Document content is chunked and stored in user_insights with source=medical_document';
COMMENT ON COLUMN medical_documents.ai_key_findings IS 'JSON array of extracted findings: [{type: "diagnosis", text: "..."}, {type: "recommendation", text: "..."}]';
