import GroupModel from '../../models/Group.js';
import { generateTasks } from '../../services/ai/generateTasks.js';

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