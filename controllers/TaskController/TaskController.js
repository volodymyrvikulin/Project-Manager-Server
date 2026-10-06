import GroupModel from '../../models/Group.js';
import handleError from '../../utils/handleError.js';

export const getAll = async (req, res) => {
    try {
        const groupId = req.params.groupId;

        const group = await GroupModel.findOne({
            _id: groupId,
            $or: [{ user: req.userId }, { members: req.userId }],
        }).populate('members', 'fullName email');

        if (!group) {
            return res.status(404).json({
                message: "Group not found or you do not have access",
            });
        }

        res.json(group.tasks);
    } catch (error) {
        console.log(error);
        handleError(res, "Failed to retrieve tasks");
    }
};

export const create = async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const { title, status, priority, dependencies, duration, pert, deadline, assignedTo } = req.body;

        const group = await GroupModel.findOne({
            _id: groupId,
            $or: [{ user: req.userId }, { members: req.userId }],
        });

        if (!group) {
            return res.status(404).json({
                message: "Group not found or you do not have access",
            });
        }

        const isOwner = group.user.toString() === req.userId.toString();
        if (!isOwner) {
            const userPermissions = group.permissions.find(
                (perm) => perm.userId.toString() === req.userId.toString()
            );
            if (!userPermissions || !userPermissions.canAddTasks) {
                return res.status(403).json({
                    message: "You do not have permission to add tasks",
                });
            }
        }

        if (assignedTo && !group.members.some(member => member.toString() === assignedTo)) {
            return res.status(400).json({
                message: "The assigned user is not a member of the group",
            });
        }

        const groupUpdate = await GroupModel.findOneAndUpdate(
            { _id: groupId },
            {
                $push: {
                    tasks: {
                        title,
                        status: status !== undefined ? status : true,
                        priority: priority !== undefined ? priority : false,
                        dependencies: dependencies || [],
                        duration: duration || 1,
                        pert: pert || {
                            optimistic: duration || 1,
                            mostLikely: duration || 1,
                            pessimistic: duration || 1,
                            expected: duration || 1,
                            standardDeviation: 0,
                            variance: 0,
                        },
                        deadline: deadline || undefined,
                        createdAt: new Date(),
                        assignedTo: assignedTo || null,
                    },
                },
            },
            { new: true, runValidators: true }
        );

        if (!groupUpdate) {
            return res.status(404).json({
                message: "Group not found",
            });
        }

        const lastIndex = groupUpdate.tasks.length - 1;
        res.json(groupUpdate.tasks[lastIndex]);
    } catch (error) {
        console.log(error);
        handleError(res, "Failed to create the task");
    }
};

export const remove = async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const taskId = req.params.taskId;

        const group = await GroupModel.findOne({
            _id: groupId,
            $or: [{ user: req.userId }, { members: req.userId }],
        });

        if (!group) {
            return res.status(404).json({
                message: "Group not found or you do not have access",
            });
        }

        const isOwner = group.user.toString() === req.userId.toString();
        if (!isOwner) {
            const userPermissions = group.permissions.find(
                (perm) => perm.userId.toString() === req.userId.toString()
            );
            if (!userPermissions || !userPermissions.canDeleteTasks) {
                return res.status(403).json({
                    message: "You do not have permission to delete tasks",
                });
            }
        }

        const groupUpdate = await GroupModel.findOneAndUpdate(
            { _id: groupId },
            { $pull: { tasks: { _id: taskId } } },
            { new: true }
        );

        if (!groupUpdate) {
            return res.status(404).json({
                message: "Group not found",
            });
        }

        await GroupModel.updateMany(
            { _id: groupId, "tasks.dependencies": taskId },
            { $pull: { "tasks.$[].dependencies": taskId } }
        );

        const updatedGroup = await GroupModel.findById(groupId)
            .populate('members', 'fullName email');

        res.json(updatedGroup.tasks);
    } catch (error) {
        console.log(error);
        handleError(res, "Failed to delete the task");
    }
};

export const update = async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const taskId = req.params.taskId;
        const { title, status, priority, dependencies, duration, pert, deadline, assignedTo } = req.body;

        const group = await GroupModel.findOne({
            _id: groupId,
            $or: [{ user: req.userId }, { members: req.userId }],
        });

        if (!group) {
            return res.status(404).json({
                message: "Group not found or you do not have access",
            });
        }

        const isOwner = group.user.toString() === req.userId.toString();
        if (!isOwner) {
            const userPermissions = group.permissions.find(
                (perm) => perm.userId.toString() === req.userId.toString()
            );
            if (!userPermissions || !userPermissions.canEditTasks) {
                return res.status(403).json({
                    message: "You do not have permission to edit tasks",
                });
            }
        }

        if (assignedTo && !group.members.some(member => member.toString() === assignedTo)) {
            return res.status(400).json({
                message: "The assigned user is not a member of the group",
            });
        }

        const taskToUpdate = group.tasks.find(task => task._id.toString() === taskId);
        if (!taskToUpdate) {
            return res.status(404).json({
                message: "Task not found",
            });
        }

        const groupUpdate = await GroupModel.findOneAndUpdate(
            { _id: groupId },
            {
                $set: {
                    "tasks.$[elem]": {
                        _id: taskId,
                        title,
                        status,
                        priority,
                        dependencies: dependencies || [],
                        duration: duration || 1,
                        pert: pert || taskToUpdate.pert || {
                            optimistic: duration || 1,
                            mostLikely: duration || 1,
                            pessimistic: duration || 1,
                            expected: duration || 1,
                            standardDeviation: 0,
                            variance: 0,
                        },
                        deadline: deadline || undefined,
                        createdAt: taskToUpdate.createdAt,
                        assignedTo: assignedTo || null,
                    },
                },
            },
            {
                new: true,
                arrayFilters: [{ "elem._id": taskId }],
                runValidators: true,
            }
        );

        if (!groupUpdate) {
            return res.status(404).json({
                message: "Group not found",
            });
        }

        const updatedGroup = await GroupModel.findById(groupId)
            .populate('members', 'fullName email');

        res.json(updatedGroup.tasks);
    } catch (error) {
        console.log(error);
        handleError(res, "Failed to update the task");
    }
};