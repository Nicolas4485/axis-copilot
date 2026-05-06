// Citation Tracker — tracks chunk sources in Message.metadata
// Ensures every agent response can be traced back to source documents
/**
 * CitationTracker manages source attribution for agent responses.
 *
 * When an agent uses RAG context to answer a question, the tracker
 * records which chunks were used so responses can be verified
 * against source material.
 */
export class CitationTracker {
    /**
     * Build citation metadata for a message.
     * This gets stored in Message.metadata for traceability.
     */
    buildMetadata(citations) {
        const uniqueDocIds = [...new Set(citations.map((c) => c.documentId))];
        return {
            citations,
            totalSources: citations.length,
            uniqueDocuments: uniqueDocIds,
        };
    }
    /**
     * Format citations as inline references for the agent's response.
     * Example: "According to the Q1 Report [1], revenue grew 15%."
     */
    formatInlineCitations(citations) {
        if (citations.length === 0)
            return '';
        const lines = citations.map((c, i) => `[${i + 1}] ${c.sourceTitle} (relevance: ${(c.relevanceScore * 100).toFixed(0)}%)`);
        return '\n\nSources:\n' + lines.join('\n');
    }
    /**
     * Extract citation references from agent response text.
     * Matches patterns like [1], [2], [Source 1].
     */
    extractReferences(responseText) {
        const refs = [];
        const pattern = /\[(\d+)\]/g;
        let match;
        while ((match = pattern.exec(responseText)) !== null) {
            const num = parseInt(match[1] ?? '', 10);
            if (!isNaN(num) && !refs.includes(num)) {
                refs.push(num);
            }
        }
        return refs.sort((a, b) => a - b);
    }
    /**
     * Verify that all citation references in the response
     * correspond to actual citations.
     */
    validateReferences(responseText, citations) {
        const refs = this.extractReferences(responseText);
        const maxRef = citations.length;
        const missingRefs = refs.filter((r) => r > maxRef || r < 1);
        return {
            valid: missingRefs.length === 0,
            missingRefs,
        };
    }
    /**
     * Store citations in the database linked to a message.
     */
    async storeCitations(messageId, citations) {
        // TODO: Update Message.metadata via Prisma
        // await prisma.message.update({
        //   where: { id: messageId },
        //   data: {
        //     metadata: {
        //       citations: this.buildMetadata(citations),
        //     },
        //   },
        // })
        void messageId;
        void citations;
    }
}
