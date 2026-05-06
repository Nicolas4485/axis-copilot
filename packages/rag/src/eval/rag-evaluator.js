// RAG Evaluator — measures RAG quality against the 60-question test set
//
// Metrics:
//   contextPrecision   — did retrieved context contain the answer?  (target >0.85)
//   answerFaithfulness — did the answer use only retrieved context? (target >0.90)
//   answerRelevance    — is the answer on-topic?                    (target >0.80)
//
// Usage:
//   import { RagEvaluator } from './rag-evaluator.js'
//   const eval = new RagEvaluator({ rag, engine, prisma })
//   const results = await eval.run({ userId, clientId, categories: ['financial-figures'] })
import { EVAL_QUESTIONS } from './test-set.js';
// ─── Thresholds ────────────────────────────────────────────────
const THRESHOLDS = {
    contextPrecision: 0.85,
    answerFaithfulness: 0.90,
    answerRelevance: 0.80,
};
// ─── RagEvaluator ─────────────────────────────────────────────
export class RagEvaluator {
    rag;
    engine;
    prisma;
    constructor({ rag, engine, prisma, }) {
        this.rag = rag;
        this.engine = engine;
        this.prisma = prisma;
    }
    /**
     * Run evaluation against the test set.
     */
    async run(options) {
        const { userId, clientId, categories, maxQuestions, onProgress } = options;
        const startTime = Date.now();
        // Filter questions
        let questions = categories
            ? EVAL_QUESTIONS.filter((q) => categories.includes(q.category))
            : EVAL_QUESTIONS;
        if (maxQuestions) {
            questions = questions.slice(0, maxQuestions);
        }
        const results = [];
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            onProgress?.(i, questions.length, q.question);
            const result = await this.evaluateQuestion(q, userId, clientId);
            results.push(result);
        }
        onProgress?.(questions.length, questions.length, 'Computing metrics...');
        return this.computeSummary(results, userId, clientId, startTime);
    }
    /**
     * Evaluate a single question.
     */
    async evaluateQuestion(q, userId, clientId) {
        const t0 = Date.now();
        try {
            // Step 1: Retrieve context via RAG
            const ragResult = await this.rag.query(q.question, userId, clientId, {
                targetTokens: 2000,
                maxChunks: 8,
            });
            const context = ragResult.context;
            // Step 2: Generate answer from context
            const answerResponse = await this.engine.route('agent_response', {
                systemPromptKey: 'RAG_REFLECT',
                messages: [{
                        role: 'user',
                        content: `Question: ${q.question}\n\nContext:\n${context}\n\nAnswer the question using ONLY the provided context. If the answer is not in the context, say "NOT FOUND".`,
                    }],
                maxTokens: 300,
                userId,
            });
            const answer = answerResponse.content
                .filter((b) => b.type === 'text')
                .map((b) => b.text).join('').trim();
            // Step 3: Score metrics
            const contextPrecision = this.scoreContextPrecision(context, q);
            const answerFaithfulness = this.scoreAnswerFaithfulness(answer, context);
            const answerRelevance = this.scoreAnswerRelevance(answer, q);
            return {
                id: q.id,
                category: q.category,
                question: q.question,
                answer,
                context: context.substring(0, 500), // truncate for storage
                contextPrecision,
                answerFaithfulness,
                answerRelevance,
                latencyMs: Date.now() - t0,
            };
        }
        catch (err) {
            return {
                id: q.id,
                category: q.category,
                question: q.question,
                answer: '',
                context: '',
                contextPrecision: 0,
                answerFaithfulness: 0,
                answerRelevance: 0,
                latencyMs: Date.now() - t0,
                error: err instanceof Error ? err.message : 'Unknown error',
            };
        }
    }
    /**
     * Context precision: fraction of expected keywords found in retrieved context.
     */
    scoreContextPrecision(context, q) {
        if (!context || context.length < 10)
            return 0;
        const lower = context.toLowerCase();
        const found = q.contextKeywords.filter((kw) => lower.includes(kw.toLowerCase()));
        return found.length / q.contextKeywords.length;
    }
    /**
     * Answer faithfulness: penalise if answer contradicts or ignores context.
     * Heuristic: if answer says "NOT FOUND" when keywords were present, penalise.
     * If answer is very long relative to context, penalise (likely hallucinating).
     */
    scoreAnswerFaithfulness(answer, context) {
        if (!answer)
            return 0;
        if (answer.toUpperCase().includes('NOT FOUND') && context.length < 50)
            return 1; // correct refusal
        if (answer.toUpperCase().includes('NOT FOUND') && context.length > 100)
            return 0.3; // missed answer in context
        // Penalise if answer is much longer than context (hallucination signal)
        const ratio = answer.length / Math.max(context.length, 1);
        if (ratio > 2)
            return 0.5;
        // Good: answer is concise and context has content
        if (context.length > 50 && answer.length > 10)
            return 0.95;
        return 0.7;
    }
    /**
     * Answer relevance: does the answer address the question topic?
     * Heuristic: check if answer contains topic words from the question.
     */
    scoreAnswerRelevance(answer, q) {
        if (!answer || answer.length < 5)
            return 0;
        const lower = answer.toLowerCase();
        // Check if the expected pattern matches the answer
        const patternMatch = q.expectedPattern.test(answer) ? 0.5 : 0;
        // Check if answer contains at least some context keywords
        const kwMatch = q.contextKeywords.some((kw) => lower.includes(kw.toLowerCase())) ? 0.3 : 0;
        // Base relevance if answer is non-empty and non-generic
        const base = answer.length > 20 && !lower.includes('i cannot') && !lower.includes('i don\'t know') ? 0.2 : 0;
        return Math.min(1, patternMatch + kwMatch + base);
    }
    /**
     * Compute summary statistics from question results.
     */
    computeSummary(results, userId, clientId, startTime) {
        const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const categories = ['financial-figures', 'risk-flags', 'company-facts'];
        const categorySummaries = categories.map((cat) => {
            const catResults = results.filter((r) => r.category === cat);
            const passing = catResults.filter((r) => r.contextPrecision >= THRESHOLDS.contextPrecision &&
                r.answerFaithfulness >= THRESHOLDS.answerFaithfulness &&
                r.answerRelevance >= THRESHOLDS.answerRelevance);
            return {
                category: cat,
                count: catResults.length,
                contextPrecision: avg(catResults.map((r) => r.contextPrecision)),
                answerFaithfulness: avg(catResults.map((r) => r.answerFaithfulness)),
                answerRelevance: avg(catResults.map((r) => r.answerRelevance)),
                passRate: catResults.length > 0 ? passing.length / catResults.length : 0,
            };
        });
        const overallPrecision = avg(results.map((r) => r.contextPrecision));
        const overallFaithfulness = avg(results.map((r) => r.answerFaithfulness));
        const overallRelevance = avg(results.map((r) => r.answerRelevance));
        const passed = overallPrecision >= THRESHOLDS.contextPrecision &&
            overallFaithfulness >= THRESHOLDS.answerFaithfulness &&
            overallRelevance >= THRESHOLDS.answerRelevance;
        return {
            runId: `eval-${Date.now()}`,
            userId,
            clientId,
            runAt: new Date().toISOString(),
            durationMs: Date.now() - startTime,
            totalQuestions: results.length,
            contextPrecision: overallPrecision,
            answerFaithfulness: overallFaithfulness,
            answerRelevance: overallRelevance,
            passRate: results.filter((r) => r.contextPrecision >= THRESHOLDS.contextPrecision &&
                r.answerFaithfulness >= THRESHOLDS.answerFaithfulness &&
                r.answerRelevance >= THRESHOLDS.answerRelevance).length / results.length,
            categories: categorySummaries,
            questions: results,
            passed,
        };
    }
}
export { THRESHOLDS };
