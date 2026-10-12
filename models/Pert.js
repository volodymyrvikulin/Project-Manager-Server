import mongoose from "mongoose";

export const PertSchema = new mongoose.Schema({
    optimistic: {
        type: Number,
        default: 1,
    },
    mostLikely: {
        type: Number,
        default: 1,
    },
    pessimistic: {
        type: Number,
        default: 1,
    },
    expected: {
        type: Number,
        default: 1,
    },
    standardDeviation: {
        type: Number,
        default: 0,
    },
    variance: {
        type: Number,
        default: 0,
    },
}, { _id: false });

export const calculatePert = (optimistic = 1, mostLikely = 1, pessimistic = 1) => {
    const o = Math.max(1, Number(optimistic) || 1);
    const m = Math.max(o, Number(mostLikely) || o);
    const p = Math.max(m, Number(pessimistic) || m);
    const expected = (o + 4 * m + p) / 6;
    const standardDeviation = (p - o) / 6;
    const variance = standardDeviation ** 2;

    return {
        optimistic: o,
        mostLikely: m,
        pessimistic: p,
        expected,
        standardDeviation,
        variance,
    };
};

export const calculateNormalCDF = (z) => {
    if (typeof z !== 'number' || isNaN(z)) return 0.5;
    if (z > 6) return 1;
    if (z < -6) return 0;

    const p = 0.2316419;
    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;

    const x = Math.abs(z);
    const t = 1 / (1 + p * x);
    const pdf = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
    const cdf = 1 - pdf * (b1 * t + b2 * Math.pow(t, 2) + b3 * Math.pow(t, 3) + b4 * Math.pow(t, 4) + b5 * Math.pow(t, 5));

    return z < 0 ? 1 - cdf : cdf;
};

export const calculateCompletionProbability = (tDeadline, tExpected, varianceOrStdDev, isVariance = false) => {
    if (tDeadline === null || tDeadline === undefined || isNaN(tDeadline)) return null;
    if (tExpected === null || tExpected === undefined || isNaN(tExpected)) return null;

    const stdDev = isVariance ? Math.sqrt(Math.max(0, varianceOrStdDev || 0)) : (varianceOrStdDev || 0);

    if (stdDev <= 0) {
        return {
            probability: tDeadline >= tExpected ? 100 : 0,
            zScore: tDeadline >= tExpected ? Infinity : -Infinity,
        };
    }

    const z = (tDeadline - tExpected) / stdDev;
    const probability = calculateNormalCDF(z) * 100;

    return {
        probability: Math.min(100, Math.max(0, probability)),
        zScore: z,
    };
};

export const calculateProjectPert = (tasks) => {
    if (!Array.isArray(tasks) || tasks.length === 0) {
        return { expected: 0, variance: 0, standardDeviation: 0 };
    }

    const taskMap = new Map(tasks.map(task => [String(task._id), task]));
    const remainingDependencies = new Map();
    const dependentTasks = new Map();
    const readyTasks = [];
    const finishTimes = new Map();
    const pathVariances = new Map();
    const lastTaskByResource = new Map();

    tasks.forEach(task => {
        const taskId = String(task._id);
        const dependencies = (task.dependencies || [])
            .map(dependencyId => String(dependencyId))
            .filter(dependencyId => taskMap.has(dependencyId));
        remainingDependencies.set(taskId, dependencies.length);

        dependencies.forEach(dependencyId => {
            const dependents = dependentTasks.get(dependencyId) || [];
            dependentTasks.set(dependencyId, [...dependents, taskId]);
        });

        if (dependencies.length === 0) readyTasks.push(taskId);
    });

    const getTaskEstimate = (task) => ({
        expected: Number(task.pert?.expected) || Math.max(1, Number(task.duration) || 1),
        variance: Number(task.pert?.variance) || 0,
    });

    let processedTasks = 0;
    while (readyTasks.length > 0) {
        readyTasks.sort((firstId, secondId) => {
            const firstTask = taskMap.get(firstId);
            const secondTask = taskMap.get(secondId);
            return new Date(firstTask.createdAt || 0) - new Date(secondTask.createdAt || 0);
        });

        const taskId = readyTasks.shift();
        const task = taskMap.get(taskId);
        const resourceId = task.assignedTo ? String(task.assignedTo) : '__unassigned__';
        const blockers = [];

        (task.dependencies || []).forEach(dependencyId => {
            const dependencyIdString = String(dependencyId);
            if (finishTimes.has(dependencyIdString)) {
                blockers.push({
                    finish: finishTimes.get(dependencyIdString),
                    variance: pathVariances.get(dependencyIdString) || 0,
                });
            }
        });

        const previousTaskId = lastTaskByResource.get(resourceId);
        if (previousTaskId) {
            blockers.push({
                finish: finishTimes.get(previousTaskId) || 0,
                variance: pathVariances.get(previousTaskId) || 0,
            });
        }

        const longestBlocker = blockers.reduce(
            (longest, blocker) => blocker.finish > longest.finish ? blocker : longest,
            { finish: 0, variance: 0 }
        );
        const estimate = getTaskEstimate(task);
        finishTimes.set(taskId, longestBlocker.finish + estimate.expected);
        pathVariances.set(taskId, longestBlocker.variance + estimate.variance);
        lastTaskByResource.set(resourceId, taskId);
        processedTasks += 1;

        (dependentTasks.get(taskId) || []).forEach(dependentId => {
            const dependenciesLeft = remainingDependencies.get(dependentId) - 1;
            remainingDependencies.set(dependentId, dependenciesLeft);
            if (dependenciesLeft === 0) readyTasks.push(dependentId);
        });
    }

    if (processedTasks < tasks.length) {
        const fallback = tasks.reduce((result, task) => {
            const estimate = getTaskEstimate(task);
            return {
                expected: result.expected + estimate.expected,
                variance: result.variance + estimate.variance,
            };
        }, { expected: 0, variance: 0 });
        return {
            expected: fallback.expected,
            variance: fallback.variance,
            standardDeviation: Math.sqrt(fallback.variance),
        };
    }

    const projectTaskId = [...finishTimes.entries()].reduce(
        (longest, [taskId, finish]) => finish > longest.finish ? { taskId, finish } : longest,
        { taskId: null, finish: 0 }
    ).taskId;
    const projectPath = {
        expected: finishTimes.get(projectTaskId) || 0,
        variance: pathVariances.get(projectTaskId) || 0,
    };

    return {
        expected: projectPath.expected,
        variance: projectPath.variance,
        standardDeviation: Math.sqrt(projectPath.variance),
    };
};

export const calculateProjectDeadlineProbability = (tasks, projectPert, startDate) => {
    if (!Array.isArray(tasks) || tasks.length === 0 || !projectPert) {
        return null;
    }

    const tasksWithDeadline = tasks.filter(t => t.deadline);
    if (tasksWithDeadline.length === 0) {
        return null;
    }

    const maxDeadlineDate = new Date(Math.max(...tasksWithDeadline.map(t => new Date(t.deadline).getTime())));
    const projectStartDate = new Date(startDate || (tasks[0] && tasks[0].createdAt) || new Date());

    const dStart = new Date(projectStartDate);
    const dDeadline = new Date(maxDeadlineDate);
    dStart.setHours(0, 0, 0, 0);
    dDeadline.setHours(0, 0, 0, 0);

    const tDeadline = Math.max(0, Math.floor((dDeadline - dStart) / (1000 * 60 * 60 * 24)));
    const tExpected = projectPert.expected || 0;
    const stdDev = projectPert.standardDeviation !== undefined
        ? projectPert.standardDeviation
        : Math.sqrt(projectPert.variance || 0);

    const result = calculateCompletionProbability(tDeadline, tExpected, stdDev);
    if (!result) return null;

    return {
        ...result,
        tDeadline,
        tExpected,
        stdDev,
        deadlineDate: maxDeadlineDate,
    };
};

export default PertSchema;
