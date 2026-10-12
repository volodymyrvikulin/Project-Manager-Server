import {
    calculateProjectPert,
    calculateProjectDeadlineProbability,
    calculateCompletionProbability,
} from '../../models/Pert.js';

const DEFAULT_MODEL = 'gemini-2.5-pro';

const responseSchema = {
    type: 'OBJECT',
    properties: {
        riskLevel: {
            type: 'STRING',
            description: 'Загальний рівень ризику проєкту: LOW, MEDIUM, HIGH або CRITICAL',
        },
        summary: {
            type: 'STRING',
            description: 'Стислий аналітичний висновок зрозумілою людською мовою (2-3 речення) без технічних формул',
        },
        criticalRisks: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Список ключових виявлених ризиків та вузьких місць простими словами (2-5 пунктів)',
        },
        recommendations: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Конкретні дієві кроки та рекомендації для проєктного менеджера (2-5 пунктів)',
        },
    },
    required: ['riskLevel', 'summary', 'criticalRisks', 'recommendations'],
};

const normalizeAnalysis = (data, calculatedProbability) => {
    const validLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const riskLevel = validLevels.includes(data.riskLevel) ? data.riskLevel : 'MEDIUM';
    const summary = typeof data.summary === 'string' && data.summary.trim()
        ? data.summary.trim()
        : 'Аналіз ризиків проєкту завершено.';

    const criticalRisks = Array.isArray(data.criticalRisks)
        ? data.criticalRisks.filter((r) => typeof r === 'string' && r.trim()).map((r) => r.trim())
        : [];

    const recommendations = Array.isArray(data.recommendations)
        ? data.recommendations.filter((r) => typeof r === 'string' && r.trim()).map((r) => r.trim())
        : [];

    return {
        riskLevel,
        summary,
        completionProbability: calculatedProbability !== null && calculatedProbability !== undefined
            ? Math.min(100, Math.max(0, Math.round(Number(calculatedProbability))))
            : null,
        criticalRisks: criticalRisks.length > 0 ? criticalRisks : ['Критичних ризиків на даний момент не виявлено.'],
        recommendations: recommendations.length > 0 ? recommendations : ['Продовжуйте виконання проєкту за запланованим графіком.'],
    };
};

export const analyzeProjectRisks = async (group) => {
    const tasks = Array.isArray(group.tasks) ? group.tasks : [];
    const members = Array.isArray(group.members) ? group.members : [];

    if (tasks.length === 0) {
        return {
            riskLevel: 'LOW',
            summary: 'У проєкті ще немає створених задач. Створіть задачі вручну або згенеруйте план за допомогою ШІ.',
            completionProbability: null,
            criticalRisks: ['Відсутні задачі для оцінки ризиків.'],
            recommendations: ['Створіть задачі для проєкту, призначте виконавців та вкажіть дедлайни.'],
        };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        const error = new Error('GEMINI_API_KEY is not configured');
        error.statusCode = 503;
        throw error;
    }

    // Map members by ID
    const memberMap = new Map();
    members.forEach((m) => {
        if (m && m._id) {
            memberMap.set(m._id.toString(), m.fullName || m.email || 'Користувач');
        }
    });

    const now = new Date();
    const todayZero = new Date(now);
    todayZero.setHours(0, 0, 0, 0);

    // Calculate project PERT using the identical CPM / critical path algorithm as the Gantt chart
    const projectPert = calculateProjectPert(tasks);
    const expectedDaysFormatted = projectPert.expected.toFixed(1);
    const stdDevDaysFormatted = projectPert.standardDeviation.toFixed(1);

    const taskDetails = tasks.map((task, idx) => {
        const pert = task.pert || {};
        const expected = Number(pert.expected) || Number(task.duration) || 1;
        const stdDev = Number(pert.standardDeviation) || 0;
        const assignee = task.assignedTo
            ? (memberMap.get(task.assignedTo.toString()) || 'Призначений виконавець')
            : 'Не призначено';

        let deadlineInfo = 'Дедлайн не встановлено';
        let isOverdue = false;
        let isDueToday = false;
        let probPercent = null;

        if (task.deadline) {
            const dlDate = new Date(task.deadline);
            const dlZero = new Date(dlDate);
            dlZero.setHours(0, 0, 0, 0);

            const daysLeft = (dlZero - todayZero) / (1000 * 60 * 60 * 24);
            isOverdue = dlZero < todayZero && task.status;
            isDueToday = dlZero.getTime() === todayZero.getTime() && task.status;

            const dateStr = dlDate.toLocaleDateString('uk-UA');
            if (isOverdue) {
                deadlineInfo = `${dateStr} (ПРОСТРОЧЕНО на ${Math.abs(daysLeft)} дн.)`;
            } else if (isDueToday) {
                deadlineInfo = `${dateStr} (ДЕЛАЙН СЬОГОДНІ, потрібно ~${expected.toFixed(1)} дн.)`;
            } else {
                deadlineInfo = `${dateStr} (залишилось ${daysLeft} дн.)`;
            }

            if (task.status) {
                const probObj = calculateCompletionProbability(daysLeft, expected, stdDev);
                if (probObj) {
                    probPercent = `${Math.round(probObj.probability)}%`;
                }
            } else {
                probPercent = '100% (виконано)';
            }
        }

        return {
            index: idx + 1,
            title: task.title,
            description: task.description || undefined,
            status: task.status ? 'В процесі' : 'Виконано',
            expectedDuration: `${expected.toFixed(1)} дн.`,
            assignee,
            prerequisiteCount: Array.isArray(task.dependencies) ? task.dependencies.length : 0,
            deadline: deadlineInfo,
            likelihoodOnTime: probPercent || 'Не розраховано (без дедлайну)',
            isOverdue,
            isDueToday,
        };
    });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => !t.status).length;
    const activeTasks = tasks.filter((t) => t.status);
    const overdueTasks = taskDetails.filter((t) => t.isOverdue);
    const dueTodayTasks = taskDetails.filter((t) => t.isDueToday);
    const unassignedTasks = tasks.filter((t) => t.status && !t.assignedTo);

    // Workload distribution
    const workload = {};
    activeTasks.forEach((t) => {
        const name = t.assignedTo ? (memberMap.get(t.assignedTo.toString()) || 'Інший') : 'Не призначено';
        workload[name] = (workload[name] || 0) + 1;
    });

    // Calculate project milestone probability from start date using calculateProjectDeadlineProbability
    const projectProb = calculateProjectDeadlineProbability(activeTasks, projectPert, group.createdAt);

    let calculatedProbability = null;
    let scheduleStatusSummary = '';

    if (projectProb) {
        // If there are overdue tasks, overall probability reflects that some milestones failed
        calculatedProbability = overdueTasks.length > 0
            ? Math.min(Math.round(projectProb.probability), Math.max(0, 100 - (overdueTasks.length * 35)))
            : Math.round(projectProb.probability);

        const dlFormatted = projectProb.deadlineDate.toLocaleDateString('uk-UA');
        scheduleStatusSummary = `Прогноз завершення всього проєкту: ${expectedDaysFormatted} дн. (±${stdDevDaysFormatted} дн.). Кінцевий дедлайн проєкту: ${dlFormatted}. Загальна оцінка своєчасного виконання: ${calculatedProbability}%.`;
    } else {
        scheduleStatusSummary = `Прогноз завершення всього проєкту: ${expectedDaysFormatted} дн. (±${stdDevDaysFormatted} дн.). Дедлайни для задач не встановлено, тому ймовірність вчасного завершення не визначена.`;
    }

    const projectContext = {
        projectTitle: group.title,
        scheduleForecast: `Прогноз завершення проєкту: ${expectedDaysFormatted} дн. ± ${stdDevDaysFormatted} дн.`,
        overview: {
            totalTasks,
            completedTasks,
            activeTasksCount: activeTasks.length,
            overdueCount: overdueTasks.length,
            overdueTaskTitles: overdueTasks.map((t) => t.title),
            dueTodayCount: dueTodayTasks.length,
            dueTodayTaskTitles: dueTodayTasks.map((t) => t.title),
            unassignedCount: unassignedTasks.length,
            workloadDistribution: workload,
        },
        tasks: taskDetails,
    };

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
                            'You are an expert Project Management and Risk Assessment AI Assistant with Explainable AI (XAI) capabilities.',
                            'Your task is to provide an objective, human-readable risk analysis report and actionable recommendations for the project manager.',
                            `Project Schedule Forecast: ${scheduleStatusSummary}`,
                            '',
                            'CRITICAL REQUIREMENTS FOR LANGUAGE AND STYLE (STRICT):',
                            '1. Output language: Ukrainian.',
                            '2. STRICTLY PROHIBITED JARGON: NEVER use technical mathematical abbreviations or jargon such as "T_E", "Z-оцінка", "Z-індекс", "PERT", "дисперсія", "нормальний розподіл".',
                            `3. ALWAYS use friendly project management phrasing: refer to the project schedule forecast as "Прогноз завершення: ${expectedDaysFormatted} дн. (±${stdDevDaysFormatted} дн.)" or "Очікуваний час виконання: ${expectedDaysFormatted} днів". This matches what the user sees on the Gantt chart.`,
                            '4. Accurately reflect the true situation:',
                            `   - Mention the overall project forecast (${expectedDaysFormatted} дн. ± ${stdDevDaysFormatted} дн.).`,
                            overdueTasks.length > 0
                                ? `   - Highlight that ${overdueTasks.length} task(s) are already OVERDUE (${overdueTasks.map((t) => `'${t.title}'`).join(', ')}). This is an active risk requiring deadline rescheduling.`
                                : '   - No tasks are currently overdue.',
                            dueTodayTasks.length > 0
                                ? `   - Note tasks due TODAY (${dueTodayTasks.map((t) => `'${t.title}'`).join(', ')}), which cannot realistically be finished today given their estimated duration.`
                                : '',
                            unassignedTasks.length > 0
                                ? `   - Mention that ${unassignedTasks.length} task(s) are not assigned to any team member.`
                                : '',
                            'Rules for response fields:',
                            '1. riskLevel: ONE OF "LOW", "MEDIUM", "HIGH", "CRITICAL". (With overdue or unassigned urgent tasks, choose "HIGH" or "CRITICAL").',
                            '2. summary: 2-3 clear, natural sentences in Ukrainian summarizing project status, schedule feasibility, and key blockers. NO FORMULAS.',
                            '3. criticalRisks: 2-5 concise bullet points naming specific tasks, overdue deadlines, tight timeframes, and unassigned work.',
                            '4. recommendations: 2-5 clear, practical steps for the project manager (e.g. reschedule overdue deadlines, assign members, break down blockers).',
                            `Project Data:\n${JSON.stringify(projectContext, null, 2)}`,
                        ].filter(Boolean).join('\n'),
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

    let parsedAnalysis;
    try {
        parsedAnalysis = JSON.parse(text);
    } catch {
        const error = new Error('Gemini API returned invalid JSON');
        error.statusCode = 502;
        throw error;
    }

    return normalizeAnalysis(parsedAnalysis, calculatedProbability);
};
