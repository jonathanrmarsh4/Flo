import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const sampleBloodWork = `LABORATORY REPORT
Patient: Test Patient
Date of Service: 2024-11-10
Lab: Quest Diagnostics

LIPID PANEL
Test Name                Result      Reference Range    Flag
Total Cholesterol        245 mg/dL   <200 mg/dL         High
LDL Cholesterol         165 mg/dL   <100 mg/dL         High
HDL Cholesterol         42 mg/dL    >40 mg/dL          Normal
Triglycerides           190 mg/dL   <150 mg/dL         High

METABOLIC PANEL
Glucose (Fasting)       108 mg/dL   70-99 mg/dL        High
HbA1c                   6.2 %       <5.7%              High
Creatinine              1.1 mg/dL   0.7-1.3 mg/dL      Normal
eGFR                    78 mL/min   >60 mL/min         Normal

COMPLETE BLOOD COUNT
WBC                     7.2 K/uL    4.0-11.0 K/uL      Normal
RBC                     4.8 M/uL    4.5-5.5 M/uL       Normal
Hemoglobin              14.5 g/dL   13.5-17.5 g/dL     Normal
Hematocrit              43 %        40-50%             Normal

THYROID FUNCTION
TSH                     2.8 mIU/L   0.4-4.0 mIU/L      Normal

VITAMINS
Vitamin D               28 ng/mL    30-100 ng/mL       Low

Notes: Patient shows elevated cholesterol and glucose levels. 
Consider lifestyle modifications and follow-up in 3 months.`;

async function createTestPDF() {
  const outputPath = path.join('/tmp', 'test-bloodwork.pdf');
  
  return new Promise<string>((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(outputPath);
    
    stream.on('finish', () => {
      console.log('✅ Test PDF created:', outputPath);
      resolve(outputPath);
    });
    
    stream.on('error', reject);
    
    doc.pipe(stream);
    
    doc.fontSize(16).text('LABORATORY REPORT', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(sampleBloodWork);
    
    doc.end();
  });
}

async function testBackendUpload() {
  console.log('🧪 Testing PDF Bloodwork Upload Backend\n');
  
  const pdfPath = await createTestPDF();
  const fileBuffer = fs.readFileSync(pdfPath);
  
  console.log('📊 Test PDF size:', (fileBuffer.length / 1024).toFixed(2), 'KB\n');
  
  const baseURL = 'http://localhost:5000';
  
  console.log('Step 1: Uploading PDF to /api/labs/upload...');
  
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  formData.append('file', blob, 'test-bloodwork.pdf');
  
  try {
    const uploadResponse = await fetch(`${baseURL}/api/labs/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'Cookie': process.env.TEST_COOKIE || '',
      },
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('❌ Upload failed:', uploadResponse.status, errorText);
      return;
    }
    
    const uploadResult = await uploadResponse.json();
    console.log('✅ Upload successful:', uploadResult);
    
    const jobId = uploadResult.jobId;
    
    console.log('\nStep 2: Polling job status...');
    
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`${baseURL}/api/labs/status/${jobId}`, {
        headers: {
          'Cookie': process.env.TEST_COOKIE || '',
        },
      });
      
      if (!statusResponse.ok) {
        console.error('❌ Status check failed:', statusResponse.status);
        return;
      }
      
      const status = await statusResponse.json();
      console.log(`  [${attempts + 1}] Status: ${status.status}`);
      
      if (status.status === 'completed' || status.status === 'needs_review') {
        console.log('\n✅ Processing completed!');
        console.log('📊 Results:', JSON.stringify(status.result, null, 2));
        
        if (status.result?.successfulBiomarkers) {
          console.log('\n✅ Successfully extracted biomarkers:');
          status.result.successfulBiomarkers.forEach((name: string) => {
            console.log(`  - ${name}`);
          });
        }
        
        if (status.result?.failedBiomarkers && status.result.failedBiomarkers.length > 0) {
          console.log('\n⚠️  Failed biomarkers:');
          status.result.failedBiomarkers.forEach((item: any) => {
            console.log(`  - ${item.name}: ${item.error}`);
          });
        }
        
        return;
      } else if (status.status === 'failed') {
        console.error('\n❌ Processing failed:', status.error);
        return;
      }
      
      attempts++;
    }
    
    console.error('\n❌ Timeout waiting for processing to complete');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testBackendUpload().catch(console.error);
