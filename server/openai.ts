// Reference: javascript_openai_ai_integrations blueprint
import OpenAI from "openai";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

interface BloodWorkAnalysis {
  biologicalAge: string;
  chronologicalAge: string;
  insights: Array<{
    category: string;
    description: string;
    severity?: "low" | "medium" | "high";
  }>;
  metrics: Record<string, any>;
  recommendations: string[];
}

export async function analyzeBloodWork(fileContent: string): Promise<BloodWorkAnalysis> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are a medical AI assistant specializing in blood work analysis. Analyze the provided blood test results and provide:
1. Estimated biological age based on the markers
2. Key health insights from the blood markers
3. Blood markers extracted from the results
4. Personalized health recommendations

Format your response as JSON with this structure:
{
  "biologicalAge": "number as string",
  "chronologicalAge": "estimated from context or 35 as default",
  "insights": [
    {
      "category": "category name",
      "description": "detailed insight",
      "severity": "low|medium|high"
    }
  ],
  "metrics": {
    "marker_name": "value with unit"
  },
  "recommendations": ["recommendation 1", "recommendation 2"]
}

IMPORTANT: 
- Biological age should be calculated based on markers like inflammation, metabolic health, organ function
- Extract all visible blood markers with their values
- Provide 3-5 key insights
- Give 3-5 actionable recommendations
- Respond ONLY with valid JSON, no markdown or explanations`
        },
        {
          role: "user",
          content: `Analyze this blood work result:\n\n${fileContent}`
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 8192,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const analysis = JSON.parse(content) as BloodWorkAnalysis;
    
    // Validate the response structure
    if (!analysis.biologicalAge || !analysis.insights || !analysis.recommendations) {
      throw new Error("Invalid analysis response structure");
    }

    return analysis;
  } catch (error) {
    console.error("Error analyzing blood work:", error);
    throw new Error("Failed to analyze blood work with AI");
  }
}
