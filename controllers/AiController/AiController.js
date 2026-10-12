import GroupModel from '../../models/Group.js';
import { generateTasks } from '../../services/ai/generateTasks.js';
import { analyzeProjectRisks } from '../../services/ai/analyzeProjectRisks.js';
import { decomposeTask } from '../../services/ai/decomposeTask.js';

export const generateGroupTasks = async (req, res) => {
    const { description } = req.body;
    if (typeof description !== 'string' || description.trim().length < 10) {
        return res.status(400).json({
            message: 'Project description must contain at least 10 characters',
        });
    }

    try {
        const group = await GroupModel.findOne({
            _id: req.params.groupId,
            $or: [{ user: req.userId }, { members: req.userId }],
        });

        if (!group) {
            return res.status(404).json({ message: 'Group not found or you do not have access' });
        }

        const tasks = await generateTasks(description.trim());
        return res.json({ tasks });
    } catch (error) {
        console.error(error);
        return res.status(error.statusCode || 500).json({
            message: error.statusCode === 503
                ? 'AI integration is not configured'
                : error.message || 'Failed to generate tasks with AI',
        });
    }
};

export const analyzeGroupRisks = async (req, res) => {
    try {
        const group = await GroupModel.findOne({
            _id: req.params.groupId,
            $or: [{ user: req.userId }, { members: req.userId }],
        }).populate('members', 'fullName email');

        if (!group) {
            return res.status(404).json({ message: 'Group not found or you do not have access' });
        }

        const analysis = await analyzeProjectRisks(group);
        return res.json({ analysis });
    } catch (error) {
        console.error(error);
        return res.status(error.statusCode || 500).json({
            message: error.statusCode === 503
                ? 'AI integration is not configured'
                : error.message || 'Failed to analyze project risks with AI',
        });
    }
};

export const decomposeGroupTask = async (req, res) => {
    const { prompt } = req.body;
    const { groupId, taskId } = req.params;

    try {
        const group = await GroupModel.findOne({
            _id: groupId,
            $or: [{ user: req.userId }, { members: req.userId }],
        });

        if (!group) {
            return res.status(404).json({ message: 'Group not found or you do not have access' });
        }

        const task = group.tasks.id ? group.tasks.id(taskId) : group.tasks.find((t) => t._id.toString() === taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found in this group' });
        }

        const subtasks = await decomposeTask({
            taskTitle: task.title,
            taskDescription: task.description,
            taskDuration: task.duration,
            additionalPrompt: prompt,
            projectTitle: group.title,
        });

        return res.json({
            subtasks,
            parentTask: {
                _id: task._id,
                title: task.title,
                description: task.description || '',
                dependencies: task.dependencies || [],
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(error.statusCode || 500).json({
            message: error.statusCode === 503
                ? 'AI integration is not configured'
                : error.message || 'Failed to decompose task with AI',
        });
    }
};