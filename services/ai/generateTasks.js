const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const responseSchema = {
    type: 'ARRAY',
    items: {
        type: 'OBJECT',
        properties: {
            title: { type: 'STRING' },
            optimisticDuration: { type: 'NUMBER' },
            mostLikelyDuration: { type: 'NUMBER' },
            pessimisticDuration: { type: 'NUMBER' },
        },
        required: ['title', 'optimisticDuration', 'mostLikelyDuration', 'pessimisticDuration'],
    },
};

const normalizeTasks = (tasks) => tasks
    .filter((task) => task && typeof task.title === 'string' && task.title.trim())
    .map((task) => {
        const optimistic = Math.max(1, Number(task.optimisticDuration) || Number(task.duration) || 1);
        const mostLikely = Math.max(optimistic, Number(task.mostLikelyDuration) || optimistic);
        const pessimistic = Math.max(mostLikely, Number(task.pessimisticDuration) || mostLikely);
        const expected = (optimistic + (4 * mostLikely) + pessimistic) / 6;
        const standardDeviation = (pessimistic - optimistic) / 6;

        return {
            title: task.title.trim(),
            status: true,
            priority: false,
            dependencies: [],
            duration: Math.max(1, Math.ceil(expected)),
            pert: {
                optimistic,
                mostLikely,
                pessimistic,
                expected,
                standardDeviation,
                variance: standardDeviation ** 2,
            },
            deadline: undefined,
            assignedTo: null,
        };
    });

export const generateTasks = async (description) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        const error = new Error('GEMINI_API_KEY is not configured');
        error.statusCode = 503;
        throw error;
    }

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: [
                            'Turn the user request into a short, concrete checklist of actionable tasks.',
                            'Preserve the user\'s domain and intent. Do not assume that the request is about software, business, databases, suppliers, or market analysis unless the user explicitly says so.',
                            'For a short shopping or household request, create only the directly relevant shopping or household actions.',
                            'Do not invent unrelated context, stakeholders, systems, suppliers, research, or implementation steps.',
                            'Use the same language as the user request.',
                            'Return only a JSON array with 1 to 10 items. Each item must contain a concise title and three duration estimates in whole days: optimisticDuration, mostLikelyDuration, and pessimisticDuration.',
                            'The three estimates must satisfy optimisticDuration <= mostLikelyDuration <= pessimisticDuration.',
                            `User request: ${description}`,
                        ].join('\n'),
                    }],
                }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema,
                },
            }),
        }
    );

    if (!response.ok) {
        let providerMessage = `HTTP ${response.status}`;
        try {
            const errorBody = await response.json();
            providerMessage = errorBody.error?.message || providerMessage;
        } catch {
            providerMessage = response.statusText || providerMessage;
        }

        const error = new Error(`Gemini API request failed: ${providerMessage}`);
        error.statusCode = response.status === 429 ? 429 : 502;
        throw error;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        const error = new Error('Gemini API returned an empty response');
        error.statusCode = 502;
        throw error;
    }

    let parsedTasks;
    try {
        parsedTasks = JSON.parse(text);
    } catch {
        const error = new Error('Gemini API returned invalid JSON');
        error.statusCode = 502;
        throw error;
    }

    return normalizeTasks(Array.isArray(parsedTasks) ? parsedTasks : []);
};