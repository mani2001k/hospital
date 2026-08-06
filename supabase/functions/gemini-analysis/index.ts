import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AnalysisRequest {
  type: 'prediction' | 'anomaly' | 'dashboard';
  orgId: string;
  data: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { type, orgId, data } = await req.json() as AnalysisRequest;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Gather context from the database based on analysis type
    let context = '';
    if (type === 'prediction') {
      context = buildPredictionContext(data);
    } else if (type === 'anomaly') {
      context = buildAnomalyContext(data);
    } else if (type === 'dashboard') {
      const { data: kpis } = await supabase
        .from('kpi_snapshots')
        .select('metric, value, recorded_at')
        .eq('org_id', orgId)
        .order('recorded_at', { ascending: false })
        .limit(20);
      context = buildDashboardContext(kpis ?? []);
    } else {
      return new Response(JSON.stringify({ error: 'Invalid analysis type' }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return new Response(JSON.stringify({
        analysis: getFallbackAnalysis(type, data),
        source: 'fallback',
        message: 'Gemini API key not configured. Showing rule-based analysis instead.',
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = buildPrompt(type, context);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 800,
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      return new Response(JSON.stringify({
        analysis: getFallbackAnalysis(type, data),
        source: 'fallback',
        message: `Gemini API error (${geminiResponse.status}). Showing rule-based analysis.`,
        error: errText,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiData = await geminiResponse.json();
    const analysisText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!analysisText) {
      return new Response(JSON.stringify({
        analysis: getFallbackAnalysis(type, data),
        source: 'fallback',
        message: 'Gemini returned no content. Showing rule-based analysis.',
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      analysis: analysisText.trim(),
      source: 'gemini',
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message,
      analysis: 'Unable to generate AI analysis at this time.',
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildPrompt(type: string, context: string): string {
  const base = `You are a clinical operations AI assistant for a hospital command centre. Analyse the following data and provide actionable insights. Be concise (3-4 paragraphs max), specific, and focus on operational recommendations. Use clear, professional language suitable for hospital administrators.`;
  
  if (type === 'prediction') {
    return `${base}

PREDICTION DATA:
${context}

Provide:
1. What this prediction means for hospital operations
2. Key risk factors and their implications
3. Recommended preventive actions
4. Confidence assessment — should they trust this prediction or seek more data?`;
  }
  
  if (type === 'anomaly') {
    return `${base}

ANOMALY DETECTION DATA:
${context}

Provide:
1. Root cause analysis — what likely caused this anomaly
2. Severity assessment and urgency
3. Immediate corrective actions
4. Long-term monitoring recommendations`;
  }
  
  return `${base}

DASHBOARD KPI SUMMARY:
${context}

Provide:
1. Overall operational health summary
2. Key areas of concern
3. Trends and patterns
4. Top 3 recommended actions`;
}

function buildPredictionContext(data: Record<string, unknown>): string {
  return `Metric: ${data.metric ?? 'unknown'}
Prediction Type: ${data.prediction_type ?? 'unknown'}
Predicted Value: ${data.predicted_value ?? 'N/A'}
Confidence: ${data.confidence ? Math.round(Number(data.confidence) * 100) + '%' : 'N/A'}
Confidence Range: ${data.confidence_low ?? 'N/A'} - ${data.confidence_high ?? 'N/A'}
Horizon: ${data.horizon_hours ?? 'N/A'} hours ahead
Ward: ${data.ward_name ?? 'Network-wide'}
Current Explanation: ${data.explanation ?? 'N/A'}
Contributing Inputs: ${JSON.stringify(data.contributing_inputs ?? {})}`;
}

function buildAnomalyContext(data: Record<string, unknown>): string {
  return `Metric: ${data.metric ?? 'unknown'}
Predicted Value: ${data.predicted_value ?? 'N/A'}
Actual Value: ${data.actual_value ?? 'N/A'}
Deviation: ${data.deviation ?? 'N/A'}
Severity: ${data.severity ?? 'unknown'}
Confidence: ${data.confidence ? Math.round(Number(data.confidence) * 100) + '%' : 'N/A'}
Ward: ${data.ward_name ?? 'N/A'}
Contributing Variables: ${JSON.stringify(data.contributing_variables ?? {})}
Current Explanation: ${data.explanation ?? 'N/A'}`;
}

function buildDashboardContext(kpis: Record<string, unknown>[]): string {
  if (kpis.length === 0) return 'No KPI data available.';
  const grouped: Record<string, string[]> = {};
  kpis.forEach((k) => {
    const metric = String(k.metric);
    if (!grouped[metric]) grouped[metric] = [];
    grouped[metric].push(`${k.value} (${new Date(String(k.recorded_at)).toLocaleString()})`);
  });
  return Object.entries(grouped).map(([metric, values]) => 
    `${metric}: ${values.join(', ')}`
  ).join('\n');
}

function getFallbackAnalysis(type: string, data: Record<string, unknown>): string {
  if (type === 'prediction') {
    const conf = data.confidence ? Math.round(Number(data.confidence) * 100) : null;
    const isLow = conf !== null && conf < 80;
    return `This prediction forecasts a ${String(data.metric ?? 'metric').replace(/_/g, ' ')} value of ${data.predicted_value ?? 'N/A'} with ${conf ? conf + '% confidence' : 'unknown confidence'}.

${isLow ? 'The confidence level is below 80%, indicating significant uncertainty. Consider gathering additional data before making operational changes based on this prediction.' : 'The confidence level is adequate for operational planning purposes.'}

Recommended actions: Monitor the relevant ward closely, ensure staffing levels match the predicted demand, and prepare contingency protocols if the predicted value exceeds normal operating thresholds.

This analysis is generated using rule-based logic. Connect a Gemini API key to enable full AI-powered analysis.`;
  }
  
  if (type === 'anomaly') {
    const dev = Number(data.deviation ?? 0);
    const isCritical = data.severity === 'critical';
    return `An anomaly has been detected in ${String(data.metric ?? 'a metric').replace(/_/g, ' ')}, with an actual value of ${data.actual_value ?? 'N/A'} deviating by ${dev > 0 ? '+' : ''}${dev.toFixed(1)} from the predicted value of ${data.predicted_value ?? 'N/A'}.

${isCritical ? 'This anomaly is classified as CRITICAL and requires immediate attention. Investigate the contributing variables and take corrective action urgently.' : 'This anomaly is classified as a warning. Monitor the situation and investigate contributing factors.'}

Recommended corrective actions: Review the contributing variables for unusual patterns, check if there were any operational changes (staffing, admissions, equipment) that could explain the deviation, and document findings for future model improvement.

This analysis is generated using rule-based logic. Connect a Gemini API key to enable full AI-powered analysis.`;
  }
  
  return `Dashboard analysis requires a Gemini API key for full AI-powered insights. KPI data is being collected and will be analysed once the key is configured.`;
}
