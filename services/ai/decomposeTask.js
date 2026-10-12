const DEFAULT_MODEL = 'gemini-2.5-pro';

const responseSchema = {
    type: 'ARRAY',
    items: {
        type: 'OBJECT',
        properties: {
            title: { type: 'STRING' },
            description: { type: 'STRING', description: 'Короткий опис підзадачі (1-2 речення)' },
            optimisticDuration: { type: 'NUMBER' },
            mostLikelyDuration: { type: 'NUMBER' },
            pessimisticDuration: { type: 'NUMBER' },
            dependencyIndices: {
                type: 'ARRAY',
                items: { type: 'INTEGER' },
                description: '0-based indices of prerequisite subtasks from this list that must be completed before this subtask can start',
            },
        },
        required: ['title', 'optimisticDuration', 'mostLikelyDuration', 'pessimisticDuration', 'dependencyIndices'],
    },
};

const normalizeSubtasks = (subtasks) => subtasks
    .filter((task) => task && typeof task.title === 'string' && task.title.trim())
    .map((task, index) => {
        const optimistic = Math.max(1, Number(task.optimisticDuration) || Number(task.duration) || 1);
        const mostLikely = Math.max(optimistic, Number(task.mostLikelyDuration) || optimistic);
        const pessimistic = Math.max(mostLikely, Number(task.pessimisticDuration) || mostLikely);
        const expected = (optimistic + (4 * mostLikely) + pessimistic) / 6;
        const standardDeviation = (pessimistic - optimistic) / 6;

        const rawDeps = Array.isArray(task.dependencyIndices)
            ? task.dependencyIndices
            : (Array.isArray(task.dependencies) ? task.dependencies : []);

        const dependencyIndices = Array.from(new Set(
            rawDeps
                .map((d) => Number(d))
                .filter((d) => Number.isInteger(d) && d >= 0 && d < index)
        ));

        return {
            title: task.title.trim(),
            description: typeof task.description === 'string' ? task.description.trim() : '',
            status: true,
            priority: false,
            dependencies: [],
            dependencyIndices,
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

export const decomposeTask = async ({ taskTitle, taskDescription, taskDuration, additionalPrompt, projectTitle }) => {
    if (!taskTitle || typeof taskTitle !== 'string' || !taskTitle.trim()) {
        const error = new Error('Task title is required for decomposition');
        error.statusCode = 400;
        throw error;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        const error = new Error('GEMINI_API_KEY is not configured');
        error.statusCode = 503;
        throw error;
    }

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const promptParts = [
        'You are an expert Project Management AI Assistant specializing in Work Breakdown Structure (WBS) and PERT estimation.',
        'Decompose the given task into 3 to 6 smaller, concrete, actionable subtasks forming a logical workflow (directed acyclic graph).',
        'Language: Use the same language as the task title (Ukrainian by default).',
        `Parent task title: "${taskTitle.trim()}"`,
    ];

    if (taskDescription && typeof taskDescription === 'string' && taskDescription.trim()) {
        promptParts.push(`Parent task description: "${taskDescription.trim()}".`);
    }
    if (taskDuration) {
        promptParts.push(`Parent task estimated duration: ${taskDuration} days.`);
    }
    if (projectTitle) {
        promptParts.push(`Project context: "${projectTitle}".`);
    }
    if (additionalPrompt && typeof additionalPrompt === 'string' && additionalPrompt.trim()) {
        promptParts.push(`Additional user instructions: "${additionalPrompt.trim()}".`);
    }

    promptParts.push(
        'Rules:',
        '1. Return only a JSON array with 3 to 6 subtask items.',
        '2. Each item must contain a concise, clear title and three whole-day duration estimates: optimisticDuration, mostLikelyDuration, and pessimisticDuration.',
        '3. Estimates must satisfy optimisticDuration <= mostLikelyDuration <= pessimisticDuration.',
        '4. The scope and combined duration of the subtasks should logically correspond to the parent task.',
        '5. dependencyIndices: an array of 0-based indices of prerequisite subtasks from this list that must finish before this subtask starts (e.g. [] for initial subtasks, [0] for a subtask depending on subtask 0). A subtask can only depend on earlier subtasks (index < current_subtask_index) to maintain an acyclic execution order.'
    );

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: promptParts.join('\n'),
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

    let parsedSubtasks;
    try {
        parsedSubtasks = JSON.parse(text);
    } catch {
        const error = new Error('Gemini API returned invalid JSON');
        error.statusCode = 502;
        throw error;
    }

    return normalizeSubtasks(Array.isArray(parsedSubtasks) ? parsedSubtasks : []);
};

