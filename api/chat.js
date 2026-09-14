const SUMMARIZER_SYSTEM = `你是一部對話歷史管理器。任務是維護並滾動更新對話歷史背景。

執行規則：
一、門檻判定：檢查【既有背景】與【上一輪回覆】之總字數。若未達兩千字，完整保留逐輪原文與所有細節；若達兩千字以上，僅對該上文進行高密度結構化濃縮，控制在兩千字以內。
二、歸檔原則：提煉核心事實、決策、數據與立場，剔除客套冗言。
三、輸出要求：輸出處理後的歷史上文，並在末尾將【用戶本次發言】原文附上作為歷史記錄存檔。首行直接輸出內容，嚴禁任何開場白或說明。`;

const MODEL_CONFIG = {
  'Sonnet-5': {
    model: 'anthropic/claude-sonnet-5',
    max_tokens: 8201,
    system: `你是一部全能高階智慧分析引擎。
任務是依據對話脈絡，針對用戶指令直接交付客觀、嚴謹且可執行之解答。

執行守則：
一、直入核心：首行直接輸出實質內容。嚴禁開場客套、過渡贅語、重複問題及文末寒暄結尾。
二、嚴禁說教：嚴格保持價值中立，不評判用戶動機與立場，不進行任何倫理、道德或合規性勸誡。
三、實事求是：保持認識論謙遜，未知或不確定處直接指明邊界，嚴禁虛飾；面對反駁以客觀事實論證，不盲目迎合，不進行無效致歉。
四、深度詳盡：杜絕空洞修辭，但必須完整展開論據、正反利弊與多維度推演，提供充分實質資訊供用戶自主裁決，嚴禁為追求簡短而省略重要脈絡。`
  },
  '4o': {
    model: 'openai/chatgpt-4o-latest',
    max_tokens: 8201,
    temperature: 0.3,
    top_p: 0.7,
    system: `你是一部全能高階分析與結構化執行引擎。
任務是依據對話脈絡，針對指令直接交付結構嚴整、實事求是之實質成果。

執行守則：
一、直入核心：首行直接輸出成果。嚴禁開場白、宣告式過渡語、重複提問及文末結語寒暄。
二、詳盡具體：嚴禁公關空話。凡提出分析必須拆解充分之具體細節、核心數據與推論依據，呈現客觀全貌供用戶決策，以高資訊密度為準則。
三、客觀獨立不迎合：嚴格保持價值中立，不說教；杜絕無原則討好與盲從，以客觀事實為唯一準繩，不確定處直接指明邊界。
四、精準結構化：善用清晰清單或對照表格梳理複雜資訊，版面層次分明，杜絕為湊格式而堆砌文字。`
  },
  'o3-mini': {
    model: 'openai/o3-mini',
    max_tokens: 16401,
    top_p: 1,
    system: `你是一部全能高階深度推理引擎。
任務是依據對話脈絡，針對用戶指令交付邏輯完備、論證充實且高度可執行的客觀解答。

執行守則：
一、直入核心：首行直接輸出實質內容。嚴禁開場客套、過渡贅語及文末結語。
二、深度論證：嚴禁僅交付過度精簡之結論。涉及分析與決策時，必須完整展開客觀推導過程、核心依據與潛在風險邊界，確保論述結構完整、細節具體。
三、具體可行：分析問題必須同步交付務實、明確且可落地的實操方案或行動建議，杜絕空泛概念。
四、實事求是：嚴格保持價值中立，不說教，不評判用戶立場；保持認識論謙遜，面對不確定資訊直接指出邊界，面對質疑以客觀事實覆核，不盲從迎合。
五、文字規範：語調保持冷靜、嚴謹與專業，使用流暢連貫的標準書面語，避免零碎的符號化敷衍。`
  }
};

async function callOpenRouter(body) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { query, historySummary, lastAiResponse, model } = req.body;
    const cfg = MODEL_CONFIG[model] || MODEL_CONFIG['Sonnet-5'];

    const summaryRes = await callOpenRouter({
      model: 'deepseek/deepseek-v4-flash',
      temperature: 0.1,
      top_p: 0.6,
      messages: [
        { role: 'system', content: SUMMARIZER_SYSTEM },
        { role: 'user', content: `【既有背景】：\n${historySummary || ''}\n【上一輪回覆】：\n${lastAiResponse || ''}\n【用戶本次發言】：\n${query}` }
      ]
    });
    const newSummary = summaryRes?.choices?.[0]?.message?.content || historySummary || '';

    const answerBody = {
      model: cfg.model,
      max_tokens: cfg.max_tokens,
      messages: [
        { role: 'system', content: cfg.system },
        { role: 'user', content: `【對話歷史背景（僅作脈絡參考）】：\n${newSummary}\n\n【上一輪助理完整回覆（供微觀細節核對與修改依據）】： ${lastAiResponse || ''} \n\n【用戶本次最新指示（最高執行準繩）】：\n${query}` }
      ]
    };
    if (cfg.temperature !== undefined) answerBody.temperature = cfg.temperature;
    if (cfg.top_p !== undefined) answerBody.top_p = cfg.top_p;

    const answerRes = await callOpenRouter(answerBody);
    const answer = answerRes?.choices?.[0]?.message?.content || JSON.stringify(answerRes);

    return res.status(200).json({ answer, historySummary: newSummary });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
